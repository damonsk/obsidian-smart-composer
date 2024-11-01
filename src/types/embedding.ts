export type EmbeddingModelName =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'nomic-embed-text'
  | 'mxbai-embed-large'
  | 'bge-m3'

export type EmbeddingModel = {
  name: EmbeddingModelName
  dimension: number
  getEmbedding: (text: string) => Promise<number[]>
}
