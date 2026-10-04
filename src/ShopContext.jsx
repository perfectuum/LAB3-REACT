import { createContext, useCallback, useEffect, useState } from "react";
import { request } from "./api.js";

export const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, groups] = await Promise.all([request("/services"), request("/categories")]);
      if (!Array.isArray(items) || !Array.isArray(groups) ||
          items.some(item => !item || !Number.isInteger(item.id) ||
            typeof item.publicCode !== "string" || !/^#[0-9]{4,}$/.test(item.publicCode) ||
            typeof item.name !== "string" || !item.name || typeof item.description !== "string" || !item.description ||
            !Number.isFinite(item.price) || item.price < 0 ||
            !Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 99 ||
            !Number.isInteger(item.categoryId) || !["product", "service"].includes(item.kind) ||
            (item.kind === "service" && (!Number.isInteger(item.duration) || item.duration <= 0))) ||
          groups.some(group => !group || !Number.isInteger(group.id) || typeof group.name !== "string" || !group.name)) {
        throw new Error("API вернул некорректный каталог или категории.");
      }
      setServices(items);
      setCategories(groups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ShopContext.Provider value={{ services, categories, loading, error, reload }}>
      {children}
    </ShopContext.Provider>
  );
}
