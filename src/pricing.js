export function getPrice(item, couponPercent = 0) {
  const generalPrice = Math.round(item.price * 100 * (1 - item.discountPercent / 100));
  return Math.round(generalPrice * (1 - couponPercent / 100)) / 100;
}

export function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 2,
  }).format(value);
}
