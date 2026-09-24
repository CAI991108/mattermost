# 产品菜单弹窗改造 - 工作记录

## 一、原始逻辑是什么

### 1. 入口位置

左上角产品菜单入口位于全局顶部栏左侧：

- `webapp/channels/src/components/global_header/left_controls/left_controls.tsx`
  - 渲染 `<ProductMenu/>`。
- `webapp/channels/src/components/global_header/left_controls/product_menu/product_menu.tsx`
  - 左上角按钮为 `ProductMenuButton`，id 为 `product_switch_menu`。
  - 点击按钮后通过 `setProductMenuSwitcherOpen(!switcherOpen)` 控制弹窗开关。
  - 弹窗主体为 `<Menu id='product-switcher-menu'>`。

### 2. 弹窗分区

原始弹窗可以理解为三块：

1. 产品切换区
   - 由 `product_menu.tsx` 渲染。
   - 固定展示 `Channels`。
   - 如果插件/产品注册到 `products`，继续展示其他产品入口。

2. 功能菜单区
   - 由 `product_menu_list/product_menu_list.tsx` 渲染。
   - 原始包含：Cloud Trial、Cloud Limit、System Console、Integrations、User Groups、App Marketplace、Download Apps、About。

3. 底部版本提示区
   - 入口在 `product_menu.tsx` 中的 `<Menu.StartTrial id='startTrial'/>`。
   - 实际组件为 `components/widgets/menu/menu_items/menu_start_trial.tsx`。
   - 未授权 Team Edition 时显示 `TEAM EDITION` 和免费版提示；Entry 版本显示 `ENTRY EDITION`。

### 3. 原始权限与展示逻辑

- `Channels`
  - 固定展示，作为频道产品入口。

- `System Console`
  - 使用 `SystemPermissionGate permissions={Permissions.SYSCONSOLE_READ_PERMISSIONS}` 控制。
  - 不依赖 `teamId`，系统管理员通常可见。

- `Integrations`
  - 原始显示条件为 `isMessaging && showIntegrations`。
  - `showIntegrations` 综合判断：非移动端、至少一种集成功能开启、当前用户具备集成管理相关权限。
  - 相关权限包括 slash command、incoming/outgoing webhook、bot、OAuth 等管理权限。

- `User Groups`
  - 显示条件为 `enableCustomUserGroups || isStarterFree || isFreeTrial`。
  - 不是简单按系统管理员显示，主要受 license/config/cloud trial 状态影响。

- `App Marketplace`
  - 使用 `TeamPermissionGate teamId={teamId} permissions={[Permissions.SYSCONSOLE_WRITE_PLUGINS]}` 控制。
  - 同时保留 `show={isMessaging && !isMobile && enablePluginMarketplace}`。
  - 因为是 `TeamPermissionGate`，当 `teamId` 为空时不显示，这是原始逻辑。

- `Download Apps`
  - 根据 `config.AppDownloadLink` 是否存在显示。

- `About`
  - 原始基本无额外 show 条件，正常登录用户可见。

### 4. 横线来源

功能菜单区上方横线不是单独业务组件，而是 `Menu.Group` 的默认 divider：

- `webapp/channels/src/components/widgets/menu/menu_group.tsx`
  - 默认渲染 `<li className='MenuGroup menu-divider' role='separator'/>`。
- `webapp/channels/src/components/widgets/menu/menu_group.scss`
  - `.MenuGroup.menu-divider` 设置 `height: 1px`、`margin: 8px 0`、背景色。

因此如果功能菜单区没有实际可见菜单项，但 `Menu.Group` 仍渲染，用户会看到 `Channels` 下方残留横线。

## 二、我们修改了什么

### 1. `product_menu.tsx`

文件：

- `webapp/channels/src/components/global_header/left_controls/product_menu/product_menu.tsx`

改动内容：

- 保留产品切换区，不改 `Channels` 和 `productItems`。
- 注释隐藏底部版本提示区。
- 不再渲染：

```tsx
<Menu.Group>
    <Menu.StartTrial id='startTrial'/>
</Menu.Group>
```

当前用注释保留说明：

```tsx
{/* LZX修改，前端隐藏底部版本提示，保留 Menu.StartTrial 组件逻辑。 */}
```

效果：

- 弹窗底部不再显示 `TEAM EDITION` / `ENTRY EDITION` 版本说明。
- `menu_start_trial.tsx` 和底层授权判断逻辑未删除。

### 2. `product_menu_list.tsx` 隐藏菜单项

文件：

- `webapp/channels/src/components/global_header/left_controls/product_menu/product_menu_list/product_menu_list.tsx`

隐藏内容：

- `Integrations / 集成`
  - 删除 UI 渲染，保留注释：`前端隐藏 Integrations 入口，保留背后权限/路由逻辑。`
  - 清理 `WebhookIncomingIcon` 以及 `showIntegrations` 相关未使用变量。

- `Download Apps / 下载应用`
  - 删除 UI 渲染，保留注释：`前端隐藏 Download Apps 入口，保留 AppDownloadLink 配置和外链组件逻辑。`
  - 清理 `DownloadOutlineIcon`、`makeUrlSafe` 等未使用引用。

- `About / 关于网站名称`
  - 删除 UI 渲染，保留注释：`前端隐藏 About 入口，保留 AboutBuildModal 组件逻辑。`
  - 清理 `InformationOutlineIcon`、`AboutBuildModal` 等未使用引用。

保留内容：

- `Cloud Trial`
- `Cloud Limit`
- `System Console`
- `User Groups`
- `App Marketplace`

### 3. 只给横线 divider 加权限

本次最终方案不是给整个第二块功能菜单区加权限，而是只控制 `Menu.Group` 的 divider。

当前 `Menu.Group` 使用自定义 `divider`：

```tsx
<Menu.Group
    divider={(
        <TeamPermissionGate
            teamId={teamId}
            permissions={[Permissions.SYSCONSOLE_WRITE_PLUGINS]}
        >
            <li
                className='MenuGroup menu-divider'
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                role='separator'
            />
        </TeamPermissionGate>
    )}
>
```

效果：

- 有 `SYSCONSOLE_WRITE_PLUGINS` 权限且有 `teamId` 时，横线显示。
- 没有该权限或 `teamId` 为空时，横线不显示。
- 第二块 children 不被这个权限整体挡住。
- `System Console` 仍按 `SystemPermissionGate` 自己的逻辑显示。

### 4. App Marketplace 权限恢复为原始逻辑

`App Marketplace` 菜单项仍单独使用：

```tsx
<TeamPermissionGate
    teamId={teamId}
    permissions={[Permissions.SYSCONSOLE_WRITE_PLUGINS]}
>
    <Menu.ItemToggleModalRedux id='marketplaceModal' ... />
</TeamPermissionGate>
```

并保留原始 show 条件：

```tsx
show={isMessaging && !isMobile && enablePluginMarketplace}
```

因此：

- 私信页或无 `teamId` 场景下，App Marketplace 不显示，这是原始逻辑。
- 频道页有 `teamId` 且用户具备插件写权限、插件市场开启、非移动端、当前是 Channels 时，App Marketplace 显示。

## 三、注意事项

1. 本次只做前端 UI 隐藏，不改后端/API/Redux 底层能力。
2. `Integrations`、`Download Apps`、`About` 的底层组件和路由未删除，只是不在产品菜单弹窗里展示。
3. `ProductMenuList` 的 Props 中仍保留部分字段声明，例如 `teamName`、`siteName`、`appDownloadLink`、集成相关配置字段；这是为了保留连接层和后续恢复能力，当前组件内部不再解构使用。
4. diagnostics 中剩余的 `Menu` / `MenuWrapper` deprecated 提示是原文件旧组件提示，不是本次改造引入的语法或类型错误。
5. 如果某个用户没有插件写权限，但因为系统权限或 Cloud/UserGroups 条件看到了第二块菜单项，这些菜单项上方不会显示横线；这是“只给横线加权限”的预期结果。
6. App Marketplace 在私信页/无 `teamId` 场景下不展示，需要从频道页进入后才会展示。原因是 App Marketplace 原始逻辑依赖 `TeamPermissionGate + teamId + SYSCONSOLE_WRITE_PLUGINS`，同时还受 `isMessaging && !isMobile && enablePluginMarketplace` 控制；私信是本项目新增的全局页面，不在传统频道 team 上下文里。为避免把产品菜单权限逻辑复杂化，本次不改该行为；功能本身没有问题，仍可在频道页按原逻辑使用。
