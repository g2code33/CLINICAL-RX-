export const runtime = 'nodejs';

export default function handler(req: any, res: any) {
  try {
    return res.status(200).json({
      ok: true,
      name: 'clinical-rx-api',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
