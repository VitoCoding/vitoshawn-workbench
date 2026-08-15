# 天蓬 VitoShawn · 工作台 FINAL 1.0

这份不是旧版本补丁，而是重新实现的最终静态 App。

## 同步设计

不使用 Realtime。
不在 `onAuthStateChange` 中调用数据库。

使用：
- Supabase `getSession`
- `signInWithPassword`
- `select`
- `upsert`

工作方式：
1. 每次输入立即写入本机 `localStorage`
2. 登录后，修改停顿约 1 秒自动上传
3. App 打开 / 回前台时主动拉云端
4. App 可见时每 15 秒检查一次云端
5. 两台设备同时编辑导致版本冲突时，不自动覆盖，要求选择：
   - 使用云端
   - 保留本机并上传

## 与旧版兼容

会尝试读取旧版数据：
- V4
- V3
- V2

也会尝试读取旧 V4 保存的 Supabase Project URL + Publishable key。

## GitHub 更新

这次建议不要再“覆盖补丁”。

在 repository 根目录保留/上传这一份 FINAL 的全部静态文件：
- index.html
- 404.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icons/

GitHub Pages 继续：
`main / (root)`

## Supabase

你当前已经创建好 `workbench_state` 表和 RLS，不需要重建。

只有新项目才执行：
`supabase-final.sql`

## 验证同步

Mac：
1. 打开「同步」
2. 看到账号已登录
3. 在「今日 → 随手记」写：`Mac FINAL 测试`
4. 约 1 秒后顶部显示「已同步」
5. Supabase Table Editor → `workbench_state` 应出现 1 行

iPhone：
1. 打开 FINAL App
2. 「同步」→ 同账号登录
3. 点一次「从云端刷新」
4. 「今日 → 随手记」应看到 `Mac FINAL 测试`

反向再写一条即可验证 iPhone → Mac。

## 版本识别

顶部固定显示：
`FINAL 1.0`

看不到这个字样，就不是最终版。
