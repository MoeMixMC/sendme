const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const config = {
  explorerUrl: IS_PRODUCTION
    ? "https://basescan.org"
    : "https://sepolia.basescan.org",
  chainName: IS_PRODUCTION ? "Base" : "Base Sepolia",
};
