# 13 - style: rename profile customization section

## 提交信息

- Commit: `f575ad2f47`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 文案与图标样式
- 范围: IUIN profile 编辑导航、Profile customization 命名

## 简介

将原 Advanced settings 命名调整为 Profile customization，并替换为更贴合个人主页自定义语义的入口图标。

## 开发目标

编辑个人主页时，侧边栏导航需要表达“个人主页自定义”而不是抽象的高级设置，降低用户理解成本。

## 改动范围

- `webapp/channels/src/components/iuin_profile/index.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`
- `webapp/channels/src/i18n/en.json`
- `webapp/channels/src/i18n/zh-CN.json`
- `webapp/channels/src/i18n/zh-TW.json`

## 实现说明

- 更新导航项显示名为 Profile customization。
- 调整对应中文本地化文案。
- 替换导航图标，使其更偏个人资料外观配置，而不是通用齿轮设置。

## 验证建议

- 打开 `/u/{username}/edit`，确认侧边栏中 Homepage 下方出现 Profile customization。
- 切换中英文环境，确认文案没有回退到 Advanced settings。
- 点击入口后，确认仍进入原 README/自定义编辑界面。

## 回退边界

可单独回退，回退只影响命名和入口图标，不影响功能数据。
