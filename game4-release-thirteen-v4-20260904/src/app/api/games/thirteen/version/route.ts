import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rawRevision = process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  const revision = /^[0-9a-f]{7,40}$/i.test(rawRevision) ? rawRevision : null;
  return NextResponse.json({
    game: 'thirteen',
    productVersion: '2.0.0-rc.1',
    protocolVersion: 2,
    rulesVersion: 'source-locked-v1',
    economyMode: 'free-v1',
    currency: 'diamond',
    buildRevision: revision,
    fairness: {
      algorithm: 'sha256',
      commitmentVersion: 'thirteen-deal-v1',
      canonicalInput: 'commitmentVersion\\nroomId\\nmatchNumber\\nseed\\nnonce',
      reveal: 'after-match',
    },
    capabilities: {
      freeMatches: true,
      stakes: false,
      exchange: false,
      matchHistory: true,
      accountExport: true,
      accountDeletion: true,
      supportRequests: true,
    },
    changes: [
      '平台钻石成为唯一持久虚拟货币',
      '十三张对局免费，不再下注或兑换牌币',
      '新增可验证发牌承诺、对局历史与申诉编号',
      '新增数据导出、账号注销与客服反馈接口',
    ],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
