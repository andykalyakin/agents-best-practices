## Local update flow

This skill is installed from your fork and tracks the upstream repository:
`DenisSergeevitch/agents-best-practices`

### Canonical local path

`/Users/ak/.agents/skills/shared/agents-best-practices`

### Personal customizations

Do not store personal behavior changes inside the base skill files unless they are part of the minimal customization hook.

Keep local preferences here instead:
`/Users/ak/.claude/PAI/USER/SKILLCUSTOMIZATIONS/agents-best-practices/`

This keeps upstream merges from overwriting Andy-specific behavior.

### Safe update steps

1. Go to the shared skill repo.
2. Fetch upstream changes.
3. Inspect the diff before merging.
4. Merge upstream into your local branch.
5. Verify that the customization hook in `SKILL.md` still exists.
6. Confirm that your personal preferences still live outside the repo.

### Commands

```bash
cd /Users/ak/.agents/skills/shared/agents-best-practices
git fetch upstream
git diff HEAD..upstream/main
git merge upstream/main
git status
```

### Branch guidance

- Keep your shared local setup changes on `andy/custom-skill-overlay`.
- If you want a cleaner history later, you can rebase that branch onto updated upstream state after reviewing diffs.
- Do not commit machine-specific symlinks into the repo.
