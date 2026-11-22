import { onSessionChange } from '../session/boundary';

export interface AcknowledgementRequest {
  key: string;
  body: { snapshotToken: string; remark: string };
}

// 同一管理会话中跨页面保留未确认的请求，退出时清除备注与快照。
const pending = new Map<string, AcknowledgementRequest>();
onSessionChange(() => pending.clear());

export const acknowledgementRequests = {
  find(adminId: string, batchId: string) {
    return pending.get(JSON.stringify([adminId, batchId])) ?? null;
  },
  recoverOrCreate(adminId: string, batchId: string, snapshotToken: string, remark: string) {
    const existing = this.find(adminId, batchId);
    if (existing) return existing;
    const request = { key: crypto.randomUUID(), body: { snapshotToken, remark } };
    pending.set(JSON.stringify([adminId, batchId]), request);
    return request;
  },
  finish(adminId: string, batchId: string, request: AcknowledgementRequest) {
    if (this.find(adminId, batchId) === request) pending.delete(JSON.stringify([adminId, batchId]));
  },
};
