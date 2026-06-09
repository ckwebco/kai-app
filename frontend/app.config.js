import "dotenv/config";

export default ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? "",
  },
});
