// 比例券按可优惠租金计算减免额，接口以整数 BP 表示。
function rentReduction(bps) {
  return '租金减免 ' + bps / 100 + '%';
}
module.exports = { rentReduction };
