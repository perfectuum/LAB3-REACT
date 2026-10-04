import { createContext, useEffect, useState } from "react";

export const CartContext = createContext(null);

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("cart") || "[]");
    if (!Array.isArray(saved)) return [];
    const items = [];
    for (const item of saved) {
      if (!item || !Number.isInteger(item.id)) continue;
      const quantity = item.quantity === undefined ? 1 : item.quantity;
      if (!Number.isInteger(quantity) || quantity < 1) continue;
      const existing = items.find(entry => entry.id === item.id);
      if (existing) existing.quantity += quantity;
      else items.push({ id: item.id, quantity });
    }
    return items;
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(readCart);
  useEffect(() => { localStorage.setItem("cart", JSON.stringify(cart)); }, [cart]);

  function addToCart(product) {
    setCart(items => {
      const existing = items.find(item => item.id === product.id);
      return existing
        ? items.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { id: product.id, quantity: 1 }];
    });
  }
  function removeOne(id) {
    setCart(items => items.map(item => item.id === id
      ? { ...item, quantity: item.quantity - 1 } : item).filter(item => item.quantity > 0));
  }
  function removeFromCart(id) {
    setCart(items => items.filter(item => item.id !== id));
  }
  function clearCart() {
    setCart([]);
  }
  return (
    <CartContext.Provider value={{ cart, addToCart, removeOne, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}
