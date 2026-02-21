const MENTION_REGEX = /@\[([^\]]+)\]\(([a-z0-9]+)\)/g;

export interface ParsedMentions {
  userIds: string[];
  contentHtml: string;
}

export function parseMentions(content: string): ParsedMentions {
  const userIds: string[] = [];
  const contentHtml = content.replace(MENTION_REGEX, (_, name: string, id: string) => {
    userIds.push(id);
    return `<span class="mention" data-user-id="${escapeHtml(id)}">@${escapeHtml(name)}</span>`;
  });
  return { userIds: [...new Set(userIds)], contentHtml };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractMentionIds(content: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, "g");
  while ((match = regex.exec(content)) !== null) {
    const id = match[2];
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}
