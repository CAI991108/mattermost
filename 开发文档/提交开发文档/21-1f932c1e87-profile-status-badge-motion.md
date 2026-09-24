# 21 - style: smooth profile status badge motion

## 提交信息

- Commit: `1f932c1e87`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 样式
- 范围: IUIN profile 头像状态徽标动效

## 简介

优化头像状态徽标的展开动效，让 hover/focus 时的 pill 展开和文字进入更柔和、连贯。

## 开发目标

原先状态徽标展开偏硬，文字和容器同步变化不够顺滑；需要保留 GitHub 风格的轻量感，同时补上可点击状态的视觉反馈。

## 改动范围

- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 为状态徽标清理 button 默认外观。
- 增加 clickable 状态的 cursor 反馈。
- 将展开动画切到更柔和的 cubic-bezier 曲线。
- 让状态文字通过 `opacity` 和 `translateX` 进入，减少突兀感。

## 验证建议

- hover 头像状态徽标，确认 pill 展开顺滑。
- focus 状态徽标，确认焦点样式清晰。
- 检查长状态文字不会溢出头像区域。

## 回退边界

可单独回退，回退后点击功能仍在，但动效会回到较硬的旧版本。
