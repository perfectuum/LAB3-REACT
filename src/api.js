const API_URL = import.meta.env.VITE_API_URL || "/api";

export async function request(path, options = {}) {
  const token = sessionStorage.getItem("token");
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Не удалось подключиться к API. Проверьте, запущен ли сервер.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    if ([500, 502, 503, 504].includes(response.status)) {
      throw new Error("Сервер API не отвечает. Проверьте, запущен ли он.");
    }
    if (response.status === 404) {
      throw new Error("Адрес API не найден. Проверьте настройки сервера.");
    }
    if (!response.ok) {
      throw new Error(`Ошибка сервера (${response.status}).`);
    }
    throw new Error("Сервер вернул некорректные данные.");
  }
  if (!response.ok) {
    const error = new Error(data.message || "Ошибка запроса к серверу.");
    error.status = response.status;
    throw error;
  }
  return data;
}
