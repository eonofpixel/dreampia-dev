/* global ctx */
// cost-limit-hook — Dreampia-Dev Plugin Loader sample (v1.1.24).
//
// Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader / hook 시스템).
//
// 본 plugin 은 post_turn hook 만 등록. ctx.payload 의 형식:
//   {
//     session_id: string,
//     turn_id: string,
//     model: string,
//     cost_usd: number,           // 이번 turn 의 비용
//     mtd_total_usd: number,      // 이번 달 누적 비용
//     limit_usd?: number,         // settings.cost_limit_usd (옵션)
//   }
//
// 동작:
//   1. limit_usd 가 정의되어 있고 mtd_total_usd 가 그 80% 이상이면 warning.
//   2. limit_usd 의 100% 이상이면 error 로 강하게 알림.
//
// 본 plugin 은 sandbox 안에서 외부 IO X — ctx.notify 만 호출. 따라서
// manifest.capabilities = [] (capability grant 불필요).
//
// 호출 protocol:
//   PluginHookRunner 가 vm.createContext({ console, ctx }) 안에서 본 script
//   를 실행. script 자체가 즉시 실행되어 ctx 를 mutate / ctx.notify 호출.

(function () {
  if (typeof ctx === 'undefined' || ctx === null) return;
  var p = ctx.payload || {};
  var limit = typeof p.limit_usd === 'number' ? p.limit_usd : null;
  var mtd = typeof p.mtd_total_usd === 'number' ? p.mtd_total_usd : 0;
  if (limit === null || limit <= 0) return;
  var ratio = mtd / limit;
  if (ratio >= 1.0) {
    if (typeof ctx.notify === 'function') {
      ctx.notify(
        '이번 달 비용 한도를 초과했어요 ($' + mtd.toFixed(2) + ' / $' + limit.toFixed(2) + ').',
        'error'
      );
    }
    return;
  }
  if (ratio >= 0.8) {
    if (typeof ctx.notify === 'function') {
      ctx.notify(
        '비용 한도의 ' + Math.round(ratio * 100) + '% 사용 중 ($' +
          mtd.toFixed(2) + ' / $' + limit.toFixed(2) + ').',
        'warning'
      );
    }
  }
})();
