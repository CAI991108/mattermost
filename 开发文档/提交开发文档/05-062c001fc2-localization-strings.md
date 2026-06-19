# 05 - chore: add IUIN localization strings

## 提交信息

- Commit: `062c001fc2`
- 类型: 国际化文案
- 范围: 英文、简体中文、繁体中文语言包

## 开发目标

补齐 IUIN profile、custom status、账号设置、homepage 编辑等新增功能所需的文案，避免 UI 出现缺失翻译或 fallback 文案。

## 改动范围

- `webapp/channels/src/i18n/en.json`
- `webapp/channels/src/i18n/zh-CN.json`
- `webapp/channels/src/i18n/zh-TW.json`

## 实现说明

- 添加 IUIN profile 页面、编辑页、设置页、section 控制和 academic entry 相关文案。
- 添加 custom status 新弹窗相关文案。
- 添加账号、安全、提示消息和保存状态文案。
- 同步中英文和繁体中文 key，降低运行时缺失翻译风险。

## 验证建议

- 分别切换英文、简体中文、繁体中文语言环境，检查新增页面是否有未翻译 key。
- 保存失败、保存成功、导入失败等状态也需要覆盖。

## 回退边界

不建议单独回退。后续功能提交依赖这些 key；回退后 UI 仍可能运行，但会出现缺失文案或默认文案。
