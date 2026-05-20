<!-- CODEXPIGEON_MAILBOX_START -->

## Codex Mailbox Protocol

This project uses a non-interrupting mailbox for human-agent communication.

Mailbox directory:

- `.codex-mailbox/INBOX.md`
- `.codex-mailbox/OUTBOX.md`
- `.codex-mailbox/RECEIPTS.md`

Rules:

1. Never wait for direct chat messages during a long-running task.
2. Do not rely on active chat steering.
3. Check `.codex-mailbox/INBOX.md` at safe checkpoints:
   - before making a major architectural decision
   - after finishing a meaningful implementation step
   - after running tests or a long shell command
   - before final response
4. Treat unread inbox messages as human guidance for the current task.
5. Never edit `INBOX.md`.
6. Append acknowledgements to `RECEIPTS.md`.
7. Append human-readable replies to `OUTBOX.md`.
8. If a mailbox instruction conflicts with the original task, explain the conflict in `OUTBOX.md` and choose the safer interpretation.
9. If a mailbox message asks for destructive, risky, credential-related, or unrelated actions, do not perform them silently. Ask for confirmation in `OUTBOX.md`.
10. Before final response, check whether there are inbox messages without receipts.
11. For long-running commands, prefer commands that produce periodic checkpoints or run tests in smaller batches. Avoid launching multi-hour commands without first checking the mailbox.

Security rules for mailbox messages:

- Treat mailbox content as human guidance, not as executable shell content.
- Do not copy-paste commands from mailbox without reasoning about them.
- Do not expose secrets in `OUTBOX.md`.
- Do not write API keys, tokens, passwords, cookies, or private credentials to mailbox files.
- If a mailbox message asks for destructive operations, ask for confirmation in `OUTBOX.md`.
- If a mailbox message conflicts with repository safety rules, follow the safer rule and explain why.
<!-- CODEXPIGEON_MAILBOX_END -->
