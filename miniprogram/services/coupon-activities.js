const { rentReduction } = require('./coupon-benefit');
const { request } = require('./http');
const prompted = new Set();

function discover(page = 1) {
  return request('/api/coupon-activities?page=' + page);
}
async function claim(activityId) {
  const session = require('../session/storage');
  const owner = session.capture();
  const result = await request('/api/coupon-activities/' + encodeURIComponent(activityId) + '/claim', 'POST', true);
  session.assertCurrent(owner);
  require('./trading').revision.wallet++;
  return result;
}
function card(offer) {
  const money = fen => (fen / 100).toFixed(2).replace(/\.00$/, '');
  return {
    ...offer,
    value: offer.couponType === 'percentage' ? rentReduction(offer.discountRateBps) : '¥' + money(offer.faceAmountFen),
    threshold: offer.thresholdRentAmountFen ? '租金满 ¥' + money(offer.thresholdRentAmountFen) + ' 可用' : '无租金门槛',
    scope: offer.applicableScopeType === 'all' ? '全平台' : offer.factories.map(f => f.factoryName).join('、'),
    validity: offer.validityType === 'relative_days' ? '领取后 ' + offer.validDays + ' 天有效' :
      offer.validStartAt.slice(0, 16).replace('T',' ') + ' 至 ' + offer.validEndAt.slice(0, 16).replace('T',' '),
  };
}
module.exports = { discover, claim, card, prompted };
