# cost-limit-hook (Dreampia-Dev sample plugin)

P1 v1.1.x Plugin Loader 의 첫 example. `post_turn` hook 으로 매 assistant
turn 종료 후 비용 한도 사용률을 검사해서 toast 알림.

## 설치

```bash
mkdir -p ~/.dreampia/plugins/cost-limit-hook
cp manifest.json ~/.dreampia/plugins/cost-limit-hook/
cp index.js ~/.dreampia/plugins/cost-limit-hook/
```

또는 본 디렉토리 자체를 `~/.dreampia/plugins/` 안에 symlink/복사.

## 작동

`post_turn` hook 이 실행될 때 `ctx.payload` 가 전달됩니다:

```ts
{
  session_id: string;
  turn_id: string;
  model: string;
  cost_usd: number;        // 이번 turn 의 비용
  mtd_total_usd: number;   // 이번 달 누적 비용
  limit_usd?: number;      // settings.cost_limit_usd (옵션)
}
```

- `mtd_total_usd / limit_usd >= 0.8` → 경고 toast.
- `mtd_total_usd / limit_usd >= 1.0` → error toast.

## Sandbox

본 plugin 은 `manifest.capabilities` 가 빈 배열입니다. `ctx.notify()` 외에
외부 IO 를 사용하지 않으므로 capability grant 가 불필요합니다.

## 다음 단계

- v1.1.25+: hook runtime 이 `ctx.notify` 를 renderer 의 toast 와 연결.
- v1.1.26+: `manifest.capabilities` 에 `NETWORK_REMOTE` 등을 명시하면
  `IpcPermissionConfirmer` 통해 사용자 승인 받음.
