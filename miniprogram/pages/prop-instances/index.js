const {
  listPropInstances,
  updatePropInstanceStatus,
  listPropInstanceStatusLogs,
  normalizePropInstance,
  normalizePropInstanceStatusLog,
} = require("../../services/prop.service");
const { request } = require("../../services/http");

async function listAdminPropInstances(propId) {
  const data = await request({ url: `/admin/props/${propId}/instances` });
  return (data || []).map(normalizePropInstance);
}

async function updateAdminPropInstanceStatus(instanceId, targetStatus, reason) {
  const data = await request({
    url: `/admin/prop-instances/${instanceId}/status`,
    method: "POST",
    data: { targetStatus, reason },
  });
  return normalizePropInstance(data);
}

async function listAdminPropInstanceStatusLogs(instanceId) {
  const data = await request({ url: `/admin/prop-instances/${instanceId}/status-logs` });
  return (data || []).map(normalizePropInstanceStatusLog);
}

function statusHint(item) {
  if (item.instanceStatus === "locked") return "该实物已被订单锁定，不能直接改异常状态";
  if (item.instanceStatus === "renting") return "该实物租赁中，需通过订单仲裁或管理员处理";
  if (item.instanceStatus === "lost") return "丢失状态需联系管理员处理";
  if (item.instanceStatus === "scrapped") return "报废状态需联系管理员处理";
  return "";
}

Page({
  data: {
    propId: null,
    fromAdmin: false,
    instances: [],
    logs: [],
    currentInstanceId: null,
    loading: false,
  },

  onLoad(options = {}) {
    this.setData({
      propId: options.propId ? Number(options.propId) : null,
      fromAdmin: options.fromAdmin === "1",
    });
  },

  async onShow() {
    await this.loadInstances();
  },

  async loadInstances() {
    if (!this.data.propId) return;
    this.setData({ loading: true });
    try {
      const list = this.data.fromAdmin
        ? await listAdminPropInstances(this.data.propId)
        : await listPropInstances(this.data.propId);
      this.setData({
        instances: list.map((item) => ({
          ...item,
          statusHint: statusHint(item),
        })),
      });
    } catch (err) {
      wx.showToast({ title: err.message || "加载实物失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadLogs(e) {
    const instanceId = Number(e.currentTarget.dataset.id);
    try {
      const logs = this.data.fromAdmin
        ? await listAdminPropInstanceStatusLogs(instanceId)
        : await listPropInstanceStatusLogs(instanceId);
      this.setData({ currentInstanceId: instanceId, logs });
    } catch (err) {
      wx.showToast({ title: err.message || "加载状态日志失败", icon: "none" });
    }
  },

  changeStatus(e) {
    const instanceId = Number(e.currentTarget.dataset.id);
    const targetStatus = e.currentTarget.dataset.status;
    const actionText = e.currentTarget.dataset.text || "状态变更";
    wx.showModal({
      title: actionText,
      editable: true,
      placeholderText: "请输入原因",
      confirmText: "确认",
      success: async (res) => {
        if (!res.confirm) return;
        const reason = (res.content || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写原因", icon: "none" });
          return;
        }
        try {
          if (this.data.fromAdmin) {
            await updateAdminPropInstanceStatus(instanceId, targetStatus, reason);
          } else {
            await updatePropInstanceStatus(instanceId, targetStatus, reason);
          }
          wx.showToast({ title: "已更新", icon: "success" });
          await this.loadInstances();
          if (this.data.currentInstanceId === instanceId) {
            await this.loadLogs({ currentTarget: { dataset: { id: instanceId } } });
          }
        } catch (err) {
          wx.showToast({ title: err.message || "状态更新失败", icon: "none" });
        }
      },
    });
  },
});
