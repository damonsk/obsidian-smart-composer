import { backOff } from 'exponential-backoff'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { App, TFile } from 'obsidian'
import pLimit from 'p-limit'

import { IndexProgress } from '../../../components/chat-view/QueryProgress'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
} from '../../../core/llm/exception'
import { InsertVector, SelectVector } from '../../../database/schema'
import { EmbeddingModel } from '../../../types/embedding'
import { openSettingsModalWithError } from '../../../utils/openSettingsModal'
import { DatabaseManager } from '../../DatabaseManager'

import { VectorRepository } from './VectorRepository'

export class VectorManager {
  private app: App
  private repository: VectorRepository
  private dbManager: DatabaseManager

  constructor(app: App, dbManager: DatabaseManager) {
    this.app = app
    this.dbManager = dbManager
    this.repository = new VectorRepository(app, dbManager.getDb())
  }

  async performSimilaritySearch(
    queryVector: number[],
    embeddingModel: EmbeddingModel,
    options: {
      minSimilarity: number
      limit: number
      scope?: {
        files: string[]
        folders: string[]
      }
    },
  ): Promise<
    (Omit<SelectVector, 'embedding'> & {
      similarity: number
    })[]
  > {
    return await this.repository.performSimilaritySearch(
      queryVector,
      embeddingModel,
      options,
    )
  }

  async updateVaultIndex(
    embeddingModel: EmbeddingModel,
    options: {
      chunkSize: number
      reindexAll?: boolean
    },
    updateProgress?: (indexProgress: IndexProgress) => void,
  ): Promise<void> {
    let filesToIndex: TFile[]
    if (options.reindexAll) {
      filesToIndex = this.app.vault.getMarkdownFiles()
      await this.repository.clearAllVectors(embeddingModel)
    } else {
      await this.deleteVectorsForDeletedFiles(embeddingModel)
      filesToIndex = await this.getFilesToIndex(embeddingModel)
      await this.repository.deleteVectorsForMultipleFiles(
        filesToIndex.map((file) => file.path),
        embeddingModel,
      )
    }

    if (filesToIndex.length === 0) {
      return
    }

    const textSplitter = RecursiveCharacterTextSplitter.fromLanguage(
      'markdown',
      {
        chunkSize: options.chunkSize,
        // TODO: Use token-based chunking after migrating to WebAssembly-based tiktoken
        // Current token counting method is too slow for practical use
        // lengthFunction: async (text) => {
        //   return await tokenCount(text)
        // },
      },
    )

    const contentChunks: InsertVector[] = (
      await Promise.all(
        filesToIndex.map(async (file) => {
          const fileContent = await this.app.vault.cachedRead(file)
          const fileDocuments = await textSplitter.createDocuments([
            fileContent,
          ])
          return fileDocuments.map((chunk): InsertVector => {
            return {
              path: file.path,
              mtime: file.stat.mtime,
              content: chunk.pageContent,
              metadata: {
                startLine: chunk.metadata.loc.lines.from as number,
                endLine: chunk.metadata.loc.lines.to as number,
              },
            }
          })
        }),
      )
    ).flat()

    updateProgress?.({
      completedChunks: 0,
      totalChunks: contentChunks.length,
      totalFiles: filesToIndex.length,
    })

    const embeddingProgress = { completed: 0, inserted: 0 }
    const embeddingChunks: InsertVector[] = []
    const batchSize = 100
    const limit = pLimit(50)
    const abortController = new AbortController()
    const tasks = contentChunks.map((chunk) =>
      limit(async () => {
        if (abortController.signal.aborted) {
          throw new Error('Operation was aborted')
        }
        try {
          await backOff(
            async () => {
              const embedding = await embeddingModel.getEmbedding(chunk.content)
              const embeddedChunk = {
                path: chunk.path,
                mtime: chunk.mtime,
                content: chunk.content,
                embedding,
                metadata: chunk.metadata,
              }
              embeddingChunks.push(embeddedChunk)
              embeddingProgress.completed++
              updateProgress?.({
                completedChunks: embeddingProgress.completed,
                totalChunks: contentChunks.length,
                totalFiles: filesToIndex.length,
              })

              // Insert vectors in batches
              if (
                embeddingChunks.length >=
                  embeddingProgress.inserted + batchSize ||
                embeddingChunks.length === contentChunks.length
              ) {
                await this.repository.insertVectors(
                  embeddingChunks.slice(
                    embeddingProgress.inserted,
                    embeddingProgress.inserted + batchSize,
                  ),
                  embeddingModel,
                )
                embeddingProgress.inserted += batchSize
              }
            },
            {
              numOfAttempts: 5,
              startingDelay: 1000,
              timeMultiple: 1.5,
              jitter: 'full',
              retry: (error) => {
                console.error(error)
                const isRateLimitError =
                  error.status === 429 &&
                  error.message.toLowerCase().includes('rate limit')
                return !!isRateLimitError // retry only for rate limit errors
              },
            },
          )
        } catch (error) {
          abortController.abort()
          throw error
        }
      }),
    )

    try {
      await Promise.all(tasks)
    } catch (error) {
      if (
        error instanceof LLMAPIKeyNotSetException ||
        error instanceof LLMAPIKeyInvalidException ||
        error instanceof LLMBaseUrlNotSetException
      ) {
        openSettingsModalWithError(this.app, (error as Error).message)
      } else {
        console.error('Error embedding chunks:', error)
        throw error
      }
    } finally {
      await this.dbManager.save()
    }
  }

  private async deleteVectorsForDeletedFiles(embeddingModel: EmbeddingModel) {
    const indexedFilePaths =
      await this.repository.getIndexedFilePaths(embeddingModel)
    for (const filePath of indexedFilePaths) {
      if (!this.app.vault.getAbstractFileByPath(filePath)) {
        await this.repository.deleteVectorsForMultipleFiles(
          [filePath],
          embeddingModel,
        )
      }
    }
  }

  private async getFilesToIndex(
    embeddingModel: EmbeddingModel,
  ): Promise<TFile[]> {
    const markdownFiles = this.app.vault.getMarkdownFiles()
    const filesToIndex = await Promise.all(
      markdownFiles.map(async (file) => {
        const fileChunks = await this.repository.getVectorsByFilePath(
          file.path,
          embeddingModel,
        )
        if (fileChunks.length === 0) {
          // File is not indexed, so we need to index it
          const fileContent = await this.app.vault.cachedRead(file)
          if (fileContent.length === 0) {
            // Ignore empty files
            return null
          }
          return file
        }
        const outOfDate = file.stat.mtime > fileChunks[0].mtime
        if (outOfDate) {
          // File has changed, so we need to re-index it
          return file
        }
        return null
      }),
    ).then((files) => files.filter(Boolean) as TFile[])
    return filesToIndex
  }
}