import agoraToken from "agora-token";
import { verifyAgoraWebhookSignature } from "./webhook-signature.mjs";

const { RtcTokenBuilder, RtmTokenBuilder } = agoraToken;

const RTC_PUBLISHER = agoraToken.RtcRole?.PUBLISHER ?? 1;
const RTC_SUBSCRIBER = agoraToken.RtcRole?.SUBSCRIBER ?? 2;
const RTM_USER = agoraToken.RtmRole?.Rtm_User ?? 1;

export function createAgora(config) {
  if (!config.agoraAppId || !config.agoraAppCertificate) {
    return null;
  }

  const {
    agoraAppId: appId,
    agoraAppCertificate: cert,
  } = config;

  return {
    mintRtcToken({
      channel,
      uid,
      publisher,
      ttlSeconds = 6 * 3600,
    }) {
      const expire = Math.floor(Date.now() / 1000) + ttlSeconds;
      const role = publisher
        ? RTC_PUBLISHER
        : RTC_SUBSCRIBER;

      if (
        typeof RtcTokenBuilder.buildTokenWithUserAccount ===
        "function"
      ) {
        return RtcTokenBuilder.buildTokenWithUserAccount(
          appId,
          cert,
          channel,
          uid,
          role,
          ttlSeconds,
          ttlSeconds,
        );
      }

      return RtcTokenBuilder.buildTokenWithAccount(
        appId,
        cert,
        channel,
        uid,
        role,
        expire,
      );
    },

    mintRtmToken({
      uid,
      ttlSeconds = 6 * 3600,
    }) {
      const expire = Math.floor(Date.now() / 1000) + ttlSeconds;

      if (RtmTokenBuilder.buildToken.length <= 4) {
        return RtmTokenBuilder.buildToken(
          appId,
          cert,
          uid,
          ttlSeconds,
        );
      }

      return RtmTokenBuilder.buildToken(
        appId,
        cert,
        uid,
        RTM_USER,
        expire,
      );
    },

    verifyWebhook(rawBody, signatures) {
      return verifyAgoraWebhookSignature(
        rawBody,
        config.agoraWebhookSecret,
        signatures,
      );
    },
  };
}