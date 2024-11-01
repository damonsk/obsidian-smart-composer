import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Trash2 } from 'lucide-react'

import { ChatConversationMeta } from '../../types/chat'

export function ChatListDropdown({
  chatList,
  onSelectConversation,
  onDeleteConversation,
  className,
  children,
}: {
  chatList: ChatConversationMeta[]
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={className}>{children}</button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="smtcmp-popover">
          <ul>
            {chatList.length === 0 ? (
              <li className="smtcmp-chat-list-dropdown-empty">
                No conversations
              </li>
            ) : (
              chatList.map((chat) => (
                <DropdownMenu.Item
                  onSelect={() => onSelectConversation(chat.id)}
                  asChild
                  key={chat.id}
                >
                  <li>
                    <div>{chat.title}</div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation() // Prevent the dropdown from closing
                        onDeleteConversation(chat.id)
                      }}
                      className={`smtcmp-chat-list-dropdown-item-delete`} // TODO: Add style for selected item
                    >
                      <Trash2 size={14} />
                    </div>
                  </li>
                </DropdownMenu.Item>
              ))
            )}
          </ul>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
