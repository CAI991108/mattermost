# 04 - chore: adapt IUIN onboarding tasks

## 提交信息

- Commit: `d19705c2c7`
- 类型: Onboarding 流程调整
- 范围: onboarding tasklist、完成页、任务管理器和测试快照

## 开发目标

将默认 Mattermost onboarding 任务裁剪为更适合 IUIN 平台的初始体验，减少默认产品任务对用户的干扰。

## 改动范围

- `webapp/channels/src/components/onboarding_tasklist/onboarding_tasklist.tsx`
- `webapp/channels/src/components/onboarding_tasklist/onboarding_tasklist_completed.tsx`
- `webapp/channels/src/components/onboarding_tasklist/onboarding_tasklist_completed.test.tsx`
- `webapp/channels/src/components/onboarding_tasklist/__snapshots__/onboarding_tasklist_completed.test.tsx.snap`
- `webapp/channels/src/components/onboarding_tasks/onboarding_tasks_manager.tsx`

## 实现说明

- 调整 onboarding 任务集合，减少不适合当前平台定位的默认任务。
- 简化任务完成页展示和对应测试期望。
- 更新任务管理器逻辑，使 onboarding 状态与新的任务集合一致。
- 更新 snapshot，保持测试输出与新 UI 结构一致。

## 验证建议

- 新用户进入平台后检查 onboarding 面板是否符合预期。
- 运行 onboarding completed 相关测试，确认 snapshot 已同步。

## 回退边界

该提交和品牌壳相关但不依赖 IUIN profile。可单独回退，但回退后用户首次进入平台可能重新看到默认 Mattermost onboarding 任务。
