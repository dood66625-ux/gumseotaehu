/** Read-only public checks. Readiness never proves authenticated delivery or private app health. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { boundedJson, notifyEndpoint } from "./update-notify-identity.mjs";
import { parseMerchantBuildInfo } from "./merchant-build-info.mjs";

export async function updateStatus(fetcher = fetch) {
  const [build, notify] = await Promise.allSettled([
    boundedJson("https://gumseo.kr/build-info.json", {}, fetcher).then(
      parseMerchantBuildInfo,
    ),
    (async () => {
      let missing = false;
      const response = await boundedJson(
        notifyEndpoint,
        {},
        async (url, options) => {
          const result = await fetcher(url, options);
          missing = result.status === 404;
          return result;
        },
      ).catch(() => null);
      if (missing) return "not-installed";
      return response?.service === "gumseo-update-notify" &&
        response.version === 1
        ? "ready"
        : "unverified";
    })(),
  ]);
  const receiver = notify.status === "fulfilled" ? notify.value : "unverified";
  return {
    deployedAssetsRevision:
      build.status === "fulfilled" ? build.value.revision : null,
    notificationReceiver: receiver,
    authenticatedDeliveryVerified: false,
    privateAppHealthVerified: false,
    timerVerified: false,
    nextStep:
      receiver === "not-installed"
        ? "서버에서 한 번 설치: cd /opt/gumseo/source && git pull --ff-only && sudo bash deploy/iwinv/enable-auto-updates.sh"
        : receiver === "ready"
          ? "수신기 준비됨. 실제 발행 신호 수락과 서버 업데이트 실행 기록은 별도 확인이 필요합니다."
          : "수신기 상태 미확인. 서버의 gumseo-private-update-notify.path 및 receiver/proxy 상태를 확인하세요.",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await updateStatus();
  console.log(JSON.stringify(result, null, 2));
  if (
    result.notificationReceiver !== "ready" ||
    result.deployedAssetsRevision === null
  )
    process.exitCode = 2;
}
