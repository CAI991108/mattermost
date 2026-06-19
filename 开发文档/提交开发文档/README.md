# IUIN Mattermost 提交开发文档索引

本文档夹整理 `origin/master..HEAD` 的 11 个本地提交，每个提交对应一份开发文档。文档按提交顺序编号，便于代码审查、回退和后续交接。

## 提交清单

1. [docs: add IUIN platform runbook](./01-817f80e86a-platform-runbook.md)
2. [chore: update IUIN shell navigation branding](./02-f0c35d4882-shell-navigation-branding.md)
3. [chore: refresh IUIN landing shell styles](./03-af2fe743f0-landing-shell-styles.md)
4. [chore: adapt IUIN onboarding tasks](./04-d19705c2c7-onboarding-tasks.md)
5. [chore: add IUIN localization strings](./05-062c001fc2-localization-strings.md)
6. [feat: rebuild custom status modal](./06-ea5399d5a9-custom-status-modal.md)
7. [test: cover redesigned custom status modal](./07-dce39ecb8d-custom-status-tests.md)
8. [feat: add IUIN profile data layer](./08-c06f5734e8-profile-data-layer.md)
9. [feat: add IUIN profile editor component](./09-fb2826786f-profile-editor-component.md)
10. [feat: wire IUIN profile entry points](./10-1b8cc01d90-profile-entry-points.md)
11. [style: add IUIN profile editor styling](./11-62c86b4910-profile-editor-styling.md)

## 使用方式

- 需要理解某个提交的设计意图时，先读对应编号文档。
- 需要回退时，优先按文档中的“回退边界”判断是否可以单独回退。
- 需要继续开发时，优先沿用文档中的“后续维护点”，避免把 UI、数据层和路由入口再次混在一个提交里。
