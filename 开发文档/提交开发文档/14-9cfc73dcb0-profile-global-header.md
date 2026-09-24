# 14 - fix: keep global header on IUIN profile pages

## 提交信息

- Commit: `9cfc73dcb0`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: IUIN profile 顶部导航、全局 header 保留

## 简介

在个人主页和编辑个人主页中保留带人工智能学院 logo 的全局上边栏，保证用户仍可通过平台导航离开当前页面。

## 开发目标

个人主页脱离 channel shell 后，不能连平台级导航也一起移除；页面顶部应保留人工智能学院 logo 与全局导航区。

## 改动范围

- `webapp/channels/src/components/root/root.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 调整 profile 独立布局与全局 header 的关系。
- 保留平台上边栏，同时隐藏不应出现在个人主页里的频道级元素。
- 修复独立布局下的高度和滚动边界。

## 验证建议

- 打开个人主页，确认顶部仍有人工智能学院 logo。
- 打开编辑个人主页，确认顶部导航同样存在。
- 检查页面内容未被 header 遮挡。

## 回退边界

可单独回退，但个人主页会再次失去全局导航入口，用户可能难以回到平台其它区域。
