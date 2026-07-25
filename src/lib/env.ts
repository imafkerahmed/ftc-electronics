/**
 * Environment configuration helper with fast-fail runtime assertions.
 */

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;

export const env = {
  get POCKETBASE_URL(): string {
    if (!pbUrl) {
      throw new Error('[env] NEXT_PUBLIC_POCKETBASE_URL is not set in environment variables.');
    }
    return pbUrl;
  },
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET || '',
};
