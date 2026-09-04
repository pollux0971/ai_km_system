# 01 · identity — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填;13 場景,反向驗證打 `csrf.ts`) |
| 進行中 | 無 |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(身分帶出部門／群組,交給 `02-authorization`;順帶把節流／鎖定與 session
時間軸補成 Gherkin)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 自身:`features/steps/common.steps.ts` 的 bare-server 註冊步驟修好(FEATURE.md
      「待協調」第 1 條)。**不擋 phase-2 開工**,但修好之前本資料夾多一句自己的 When。
- [ ] 契約:`02-authorization` phase-1 存在,而且它說得出「身分的哪個欄位變成
      `RetrievalScope`」。E04-S009 目前 blocked-team-b。
- [ ] 契約:`requireAnyRole` 歸 01 還是 02,經 `/feature` 分流確認(FEATURE.md 開放問題)

**phase-3(登入體驗 `@e2e`)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I2 通過(apps/web 要先能問問題,才談得上「逾時後重登再問一次」)
- [ ] 契約:無(`auth.yaml` 已凍結且夠用)

## Gate 未滿足時

**等 `02-authorization` / E04-S009**:不要在 `services/identity` 裡自己生一張
「department 字串 → scopeKey」的對應表。那正是 E04-S009 裁示禁止的過渡表,而且會讓
02 落地時有兩個真相來源。

gate 未滿足時**現在就可以做**的,全部不碰授權:

1. 把「沒寫進 phase-1 的行為」清單裡的**登入節流與帳號鎖定**(E02-S034)寫成
   `phase-2.feature` 的場景群。它已經有 17 條 vitest 撐著,綁得到入口,只是 phase-1
   塞不下。嚴格級,反向驗證打 `countRecentFailuresByUsername` / `countRecentFailuresByIp`。
2. session 時間軸(絕對 TTL、閒置上限、期間被停用)——先想清楚場景怎麼操控時間
   (直接寫 `sessions.expires_at` 是 `require-session.test.ts` 已經在用的做法)。
3. `Secure` cookie 與 `AI_KM_SESSION_COOKIE_DOMAIN` 的登出清除行為。

**不可以先做**:任何「先給 demo 使用者一個寫死的 scope」的接線。那要等 02,
而且要在 ADR 記成 I2 的已知限制(`docs/01-roadmap.md` I2 段已經寫了)。

## 完成後

phase-2 完成即解鎖 `02-authorization` 的「scope 真的來自身分」那條線,也就是 I3 的第一塊;
`06-retrieval` phase-2 的「固定 `dept:eng`」暫時限制要在那時候一起拿掉。
