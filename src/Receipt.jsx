import { useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import { request } from "./api.js";
import { money } from "./pricing.js";

export function Receipt({ order }) {
  const beforeCouponTotal = order.items.reduce((sum, item) =>
    sum + Math.round(item.priceBeforeCoupon * 100) * item.quantity, 0) / 100;
  return (
    <article className="receipt">
      <h2>Чек по заказу №{order.id}</h2>
      <p>Дата: {new Date(order.createdAt).toLocaleString("ru-RU")}</p>
      <p>Покупатель: {order.contactName}</p>
      <p>Способ оплаты: {order.paymentMethod === "cash" ? "Наличными" : "Онлайн"}</p>
      <ul>
        {order.items.map(item => <li key={item.serviceId}>
          <strong>{item.name}</strong> - Кол-во: {item.quantity}<br />
          Цена до персональной скидки: {money(item.priceBeforeCoupon)} за единицу<br />
          Цена в заказе: {money(item.finalPrice)} за единицу;
          сумма: {money(item.finalPrice * item.quantity)}
        </li>)}
      </ul>
      <p>Сумма до персональной скидки: {money(beforeCouponTotal)}</p>
      <p className="total">Итого: {money(order.total)}</p>
    </article>
  );
}

export default function ReceiptPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useContext(AuthContext);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    request(`/orders/${encodeURIComponent(id)}`).then(data => {
      setOrder(data);
      setError("");
    }).catch(err => setError(err.message));
  }, [id, user?.id]);

  if (authLoading) return <p role="status">Загрузка...</p>;
  if (!user) return <p>Чтобы посмотреть чек, <Link to="/login">войдите</Link>.</p>;
  return <section>
    {error ? <p className="error" role="alert">{error}</p> : order ? <Receipt order={order} /> : <p role="status">Загрузка чека...</p>}
  </section>;
}
