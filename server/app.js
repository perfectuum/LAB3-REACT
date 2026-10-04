import express from "express";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const hashPassword = promisify(scrypt);
const userSelect = `SELECT u.Id AS id, u.Name AS name, u.Email AS email, u.Login AS login,
  u.Phone AS phone, u.Address AS address,
  r.Name AS role, u.CouponId AS couponId, c.Name AS couponName,
  COALESCE(c.DiscountPercent, 0) AS couponPercent
  FROM Users u JOIN Roles r ON r.Id = u.RoleId
  LEFT JOIN Coupons c ON c.Id = u.CouponId`;

function orderError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validLogin(value) {
  return value.length <= 150 && (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
    /^[\p{L}\p{N}._-]{3,30}$/u.test(value));
}

export function createApp(query, withTransaction) {
  const app = express();
  const sessions = new Map();
  app.use(express.json());

  async function authorize(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ message: "Войдите в аккаунт." });
    }
    const [user] = await query(`${userSelect} WHERE u.Id = @id`, { id: session.userId });
    if (!user) return res.status(401).json({ message: "Пользователь не найден." });
    req.user = user;
    req.token = token;
    next();
  }

  function adminOnly(req, res, next) {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Доступ разрешён только администратору." });
    next();
  }

  async function loadOrders(userId, orderId) {
    const rows = await query(`SELECT o.Id AS orderId, o.UserId AS userId,
      o.ContactName AS contactName, o.ContactEmail AS contactEmail,
      o.Phone AS phone, o.Address AS address, o.Status AS status,
      o.Total AS total, o.CreatedAt AS createdAt, o.CouponPercent AS couponPercent,
      o.PaymentMethod AS paymentMethod,
      oi.ServiceId AS serviceId, oi.Name AS itemName, oi.Kind AS kind,
      oi.Quantity AS quantity, oi.UnitPrice AS unitPrice,
      oi.GeneralDiscountPercent AS generalDiscountPercent,
      oi.FinalPrice AS finalPrice
      FROM Orders o JOIN OrderItems oi ON oi.OrderId = o.Id
      ${userId === undefined ? "" : `WHERE o.UserId = @userId${orderId === undefined ? "" : " AND o.Id = @orderId"}`}
      ORDER BY o.CreatedAt DESC, o.Id DESC, oi.Id`, {
      ...(userId === undefined ? {} : { userId }),
      ...(orderId === undefined ? {} : { orderId }),
    });
    const orders = new Map();
    for (const row of rows) {
      if (!orders.has(row.orderId)) {
        orders.set(row.orderId, {
          id: row.orderId, userId: row.userId, contactName: row.contactName,
          contactEmail: row.contactEmail, phone: row.phone, address: row.address,
          status: row.status, total: row.total, createdAt: row.createdAt,
          couponPercent: row.couponPercent, paymentMethod: row.paymentMethod, items: [],
        });
      }
      orders.get(row.orderId).items.push({
        serviceId: row.serviceId, name: row.itemName, kind: row.kind,
        quantity: row.quantity, unitPrice: row.unitPrice,
        priceBeforeCoupon: Math.round(Math.round(row.unitPrice * 100) *
          (100 - row.generalDiscountPercent) / 100) / 100,
        finalPrice: row.finalPrice,
      });
    }
    return [...orders.values()];
  }

  app.get("/api/services", async (req, res) => {
    res.json(await query(`SELECT Id AS id, PublicCode AS publicCode,
      Name AS name, Description AS description,
      Duration AS duration, Price AS price, Image AS image, Kind AS kind,
      CategoryId AS categoryId, DiscountPercent AS discountPercent FROM Services ORDER BY Id`));
  });

  app.get("/api/categories", async (req, res) => {
    res.json(await query("SELECT Id AS id, Name AS name FROM Categories ORDER BY Id"));
  });

  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ message: "Введите имя длиной до 100 символов." });
    }
    if (typeof email !== "string" || email.trim().length > 150 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: "Введите корректный email." });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Пароль должен содержать от 8 до 128 символов." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await query("SELECT Id FROM Users WHERE Email = @email", { email: normalizedEmail });
    if (existing) return res.status(409).json({ message: "Этот email уже зарегистрирован." });

    const passwordSalt = randomBytes(16).toString("hex");
    const passwordHash = (await hashPassword(password, passwordSalt, 64)).toString("hex");
    let account;
    try {
      [account] = await query(`INSERT INTO Users (Name, Email, Login, PasswordHash, PasswordSalt, RoleId)
        OUTPUT INSERTED.Id AS id
        VALUES (@name, @email, @login, @passwordHash, @passwordSalt,
          (SELECT Id FROM Roles WHERE Name = N'user'))`, {
        name: name.trim(), email: normalizedEmail, login: normalizedEmail, passwordHash, passwordSalt,
      });
    } catch (error) {
      if ([2601, 2627].includes(error.number)) {
        return res.status(409).json({ message: "Этот email или логин уже используется." });
      }
      throw error;
    }
    const [user] = await query(`${userSelect} WHERE u.Id = @id`, { id: account.id });
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, expires: Date.now() + 24 * 60 * 60 * 1000 });
    res.status(201).json({ token, user });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ message: "Заполните email и пароль." });
    }
    const identifier = email.trim().toLowerCase();
    if (!validLogin(identifier)) {
      return res.status(400).json({ message: "Введите корректный логин или email." });
    }
    const [account] = await query(`SELECT Id AS id, PasswordHash AS passwordHash,
      PasswordSalt AS passwordSalt FROM Users WHERE Login = @login`, { login: identifier });
    if (!account) return res.status(401).json({ message: "Неверный email или пароль." });
    const actual = await hashPassword(password, account.passwordSalt, 64);
    const expected = Buffer.from(account.passwordHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ message: "Неверный email или пароль." });
    }
    const [user] = await query(`${userSelect} WHERE u.Id = @id`, { id: account.id });
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, expires: Date.now() + 24 * 60 * 60 * 1000 });
    res.json({ token, user });
  });

  app.get("/api/auth/me", authorize, (req, res) => res.json(req.user));
  app.post("/api/auth/logout", authorize, (req, res) => {
    sessions.delete(req.token);
    res.json({ message: "Вы вышли из аккаунта." });
  });

  app.put("/api/profile", authorize, async (req, res) => {
    const { name, phone, address } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
        typeof phone !== "string" || phone.trim().length > 30 ||
        typeof address !== "string" || address.trim().length > 300) {
      return res.status(400).json({ message: "Проверьте имя, телефон и адрес." });
    }
    await query("UPDATE Users SET Name = @name, Phone = @phone, Address = @address WHERE Id = @id", {
      id: req.user.id, name: name.trim(), phone: phone.trim() || null, address: address.trim() || null,
    });
    const [user] = await query(`${userSelect} WHERE u.Id = @id`, { id: req.user.id });
    res.json(user);
  });

  app.put("/api/profile/credentials", authorize, async (req, res) => {
    const { login, currentPassword, newPassword } = req.body || {};
    if (typeof login !== "string" || !validLogin(login.trim().toLowerCase())) {
      return res.status(400).json({ message: "Логин должен быть email или именем от 3 до 30 символов." });
    }
    if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 128 ||
        typeof newPassword !== "string" ||
        (newPassword && (newPassword.length < 8 || newPassword.length > 128))) {
      return res.status(400).json({ message: "Проверьте текущий и новый пароль. Новый пароль - от 8 до 128 символов." });
    }
    const normalizedLogin = login.trim().toLowerCase();
    const [account] = await query(`SELECT PasswordHash AS passwordHash, PasswordSalt AS passwordSalt
      FROM Users WHERE Id = @id`, { id: req.user.id });
    const actual = await hashPassword(currentPassword, account.passwordSalt, 64);
    const expected = Buffer.from(account.passwordHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ message: "Неверный текущий пароль." });
    }
    const [duplicate] = await query("SELECT Id FROM Users WHERE Login = @login AND Id <> @id", {
      login: normalizedLogin, id: req.user.id,
    });
    if (duplicate) return res.status(409).json({ message: "Этот логин уже занят." });
    const passwordSalt = newPassword ? randomBytes(16).toString("hex") : account.passwordSalt;
    const passwordHash = newPassword
      ? (await hashPassword(newPassword, passwordSalt, 64)).toString("hex")
      : account.passwordHash;
    try {
      await query(`UPDATE Users SET Login = @login, PasswordHash = @passwordHash,
        PasswordSalt = @passwordSalt WHERE Id = @id`, {
        id: req.user.id, login: normalizedLogin, passwordHash, passwordSalt,
      });
    } catch (error) {
      if ([2601, 2627].includes(error.number)) {
        return res.status(409).json({ message: "Этот логин уже занят." });
      }
      throw error;
    }
    const [user] = await query(`${userSelect} WHERE u.Id = @id`, { id: req.user.id });
    res.json(user);
  });

  app.get("/api/orders/me", authorize, async (req, res) => {
    res.json(await loadOrders(req.user.id));
  });

  app.get("/api/orders/:id", authorize, async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({ message: "Некорректный номер заказа." });
    }
    const [order] = await loadOrders(req.user.id, orderId);
    if (!order) return res.status(404).json({ message: "Заказ не найден." });
    res.json(order);
  });

  app.post("/api/orders", authorize, async (req, res) => {
    if (req.user.role === "admin") {
      return res.status(403).json({ message: "Администратор не может оформлять заказы." });
    }
    const { items, phone, address, paymentMethod } = req.body || {};
    if (!Array.isArray(items) || items.length < 1 || items.length > 100 ||
        items.some(item => !item || !Number.isInteger(item.id) || item.id < 1 ||
          !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) ||
        new Set(items.map(item => item.id)).size !== items.length) {
      return res.status(400).json({ message: "Проверьте товары и их количество в корзине." });
    }
    if (typeof phone !== "string" || phone.trim().length < 6 || phone.trim().length > 30 ||
        typeof address !== "string" || address.trim().length > 300) {
      return res.status(400).json({ message: "Введите телефон и проверьте адрес." });
    }
    if (!["cash", "online"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Выберите способ оплаты." });
    }
    const couponPercent = req.user.couponPercent;
    if (!Number.isInteger(couponPercent) || couponPercent < 0 || couponPercent > 99) {
      return res.status(400).json({ message: "Некорректная скидка купона." });
    }
    try {
      const order = await withTransaction(async run => {
        const parameters = Object.fromEntries(items.map((item, index) => [`id${index}`, item.id]));
        const placeholders = items.map((_, index) => `@id${index}`).join(", ");
        const catalog = await run(`SELECT Id AS id, Name AS name, Kind AS kind,
          Price AS price, DiscountPercent AS discountPercent
          FROM Services WHERE Id IN (${placeholders})`, parameters);
        if (catalog.length !== items.length) throw orderError("Одна из позиций больше не доступна.");
        const byId = new Map(catalog.map(item => [item.id, item]));
        if (catalog.some(item => !Number.isInteger(item.discountPercent) ||
            item.discountPercent < 0 || item.discountPercent > 99)) {
          throw orderError("Некорректная скидка у одной из позиций.");
        }
        if (catalog.some(item => item.kind === "product") && !address.trim()) {
          throw orderError("Укажите адрес доставки для товаров.");
        }
        const orderItems = items.map(entry => {
          const item = byId.get(entry.id);
          const unitCents = Math.round(item.price * 100);
          const afterGeneral = Math.round(unitCents * (100 - item.discountPercent) / 100);
          const finalCents = Math.round(afterGeneral * (100 - couponPercent) / 100);
          return { ...item, quantity: entry.quantity, unitCents, finalCents };
        });
        const totalCents = orderItems.reduce((sum, item) => sum + item.finalCents * item.quantity, 0);
        const [created] = await run(`INSERT INTO Orders
          (UserId, ContactName, ContactEmail, Phone, Address, CouponId, CouponPercent, Total, PaymentMethod)
          OUTPUT INSERTED.Id AS id
          VALUES (@userId, @contactName, @contactEmail, @phone, @address,
            @couponId, @couponPercent, @total, @paymentMethod)`, {
          userId: req.user.id, contactName: req.user.name, contactEmail: req.user.email,
          phone: phone.trim(), address: address.trim() || null, couponId: req.user.couponId,
          couponPercent, total: totalCents / 100, paymentMethod,
        });
        for (const item of orderItems) {
          await run(`INSERT INTO OrderItems
            (OrderId, ServiceId, Name, Kind, Quantity, UnitPrice, FinalPrice,
              GeneralDiscountPercent, CouponPercent)
            VALUES (@orderId, @serviceId, @name, @kind, @quantity, @unitPrice,
              @finalPrice, @generalDiscountPercent, @couponPercent)`, {
            orderId: created.id, serviceId: item.id, name: item.name, kind: item.kind,
            quantity: item.quantity, unitPrice: item.unitCents / 100,
            finalPrice: item.finalCents / 100, generalDiscountPercent: item.discountPercent,
            couponPercent,
          });
        }
        return { id: created.id, total: totalCents / 100, status: "Оформлен", paymentMethod };
      });
      const [receipt] = await loadOrders(req.user.id, order.id);
      res.status(201).json(receipt);
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ message: error.message });
      throw error;
    }
  });

  app.use("/api/admin", authorize, adminOnly);
  app.get("/api/admin/users", async (req, res) => {
    const users = await query(`${userSelect} ORDER BY u.Id`);
    res.json(users.map(({ id, couponId, ...user }) => user));
  });
  app.get("/api/admin/coupons", async (req, res) => {
    res.json(await query("SELECT Name AS name, DiscountPercent AS discountPercent FROM Coupons ORDER BY Id"));
  });
  app.get("/api/admin/orders", async (req, res) => {
    const orders = await loadOrders();
    res.json(orders.map(({ userId, ...order }) => ({
      ...order,
      items: order.items.map(({ serviceId, ...item }) => item),
    })));
  });
  app.delete("/api/admin/orders/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ message: "Некорректный номер заказа." });
    }
    const deleted = await withTransaction(async run => {
      await run("DELETE FROM OrderItems WHERE OrderId = @id", { id });
      return run("DELETE FROM Orders OUTPUT DELETED.Id AS id WHERE Id = @id", { id });
    });
    if (!deleted.length) return res.status(404).json({ message: "Заказ не найден." });
    res.json({ message: "Заказ и чек удалены." });
  });
  app.post("/api/admin/categories", async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ message: "Введите название категории (до 100 символов)." });
    }
    const normalizedName = name.trim();
    const [duplicate] = await query(`SELECT Id FROM Categories
      WHERE LOWER(LTRIM(RTRIM(Name))) = LOWER(@name)`, { name: normalizedName });
    if (duplicate) return res.status(409).json({ message: "Категория с таким названием уже существует." });
    const [category] = await query("INSERT INTO Categories (Name) OUTPUT INSERTED.Id AS id, INSERTED.Name AS name VALUES (@name)", { name: normalizedName });
    res.status(201).json(category);
  });
  app.put("/api/admin/categories/:name", async (req, res) => {
    const oldName = req.params.name;
    const name = req.body?.name;
    if (!oldName || oldName.length > 100 || typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ message: "Выберите категорию и введите название до 100 символов." });
    }
    const [category] = await query("SELECT Id AS id FROM Categories WHERE Name = @oldName", { oldName });
    if (!category) return res.status(404).json({ message: "Категория не найдена." });
    const normalizedName = name.trim();
    const [duplicate] = await query(`SELECT Id FROM Categories
      WHERE LOWER(LTRIM(RTRIM(Name))) = LOWER(@name) AND Id <> @id`, { name: normalizedName, id: category.id });
    if (duplicate) return res.status(409).json({ message: "Категория с таким названием уже существует." });
    const updated = await query(`UPDATE Categories SET Name = @name
      OUTPUT INSERTED.Name AS name WHERE Id = @id`, { id: category.id, name: normalizedName });
    if (!updated.length) return res.status(404).json({ message: "Категория не найдена." });
    res.json({ message: "Категория обновлена." });
  });
  app.put("/api/admin/services/:code", async (req, res) => {
    const code = req.params.code;
    const { discountPercent } = req.body || {};
    if (!/^#[0-9]{4,}$/.test(code) || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 99) {
      return res.status(400).json({ message: "Выберите позицию и целую скидку от 0 до 99%." });
    }
    const updated = await query(`UPDATE Services SET DiscountPercent = @discountPercent
      OUTPUT INSERTED.PublicCode AS code WHERE PublicCode = @code`, { code, discountPercent });
    if (!updated.length) return res.status(404).json({ message: "Товар или услуга не найдены." });
    res.json({ message: "Скидка обновлена." });
  });
  app.put("/api/admin/services/:code/category", async (req, res) => {
    const code = req.params.code;
    const categoryName = req.body?.categoryName;
    if (!/^#[0-9]{4,}$/.test(code) || typeof categoryName !== "string" || !categoryName.trim()) {
      return res.status(400).json({ message: "Выберите позицию и категорию." });
    }
    const [category] = await query("SELECT Id AS id FROM Categories WHERE Name = @name", { name: categoryName });
    if (!category) return res.status(404).json({ message: "Категория не найдена." });
    const updated = await query(`UPDATE Services SET CategoryId = @categoryId
      OUTPUT INSERTED.PublicCode AS code WHERE PublicCode = @code`, { code, categoryId: category.id });
    if (!updated.length) return res.status(404).json({ message: "Товар или услуга не найдены." });
    res.json({ message: "Категория позиции обновлена." });
  });
  app.put("/api/admin/coupons/:name", async (req, res) => {
    const name = req.params.name;
    const discountPercent = req.body?.discountPercent;
    if (!name || name.length > 100 || !Number.isInteger(discountPercent) ||
        discountPercent < 0 || discountPercent > 99) {
      return res.status(400).json({ message: "Скидка купона должна быть от 0 до 99%." });
    }
    const updated = await query(`UPDATE Coupons SET DiscountPercent = @discountPercent
      OUTPUT INSERTED.Name AS name WHERE Name = @name`, { name, discountPercent });
    if (!updated.length) return res.status(404).json({ message: "Купон не найден." });
    res.json({ message: "Скидка купона обновлена." });
  });
  app.put("/api/admin/users/:login/coupon", async (req, res) => {
    const login = req.params.login;
    const { couponName } = req.body || {};
    if (!validLogin(login) || (couponName !== null &&
        (typeof couponName !== "string" || !couponName.trim()))) {
      return res.status(400).json({ message: "Выберите пользователя и вид купона." });
    }
    let couponId = null;
    if (couponName !== null) {
      const [coupon] = await query("SELECT Id AS id FROM Coupons WHERE Name = @name", { name: couponName });
      if (!coupon) return res.status(404).json({ message: "Купон не найден." });
      couponId = coupon.id;
    }
    const updated = await query("UPDATE Users SET CouponId = @couponId OUTPUT INSERTED.Login AS login WHERE Login = @login", {
      login, couponId,
    });
    if (!updated.length) return res.status(404).json({ message: "Пользователь не найден." });
    res.json({ message: "Купон назначен." });
  });

  app.use((req, res) => res.status(404).json({ message: "Адрес API не найден." }));
  app.use((error, req, res, _next) => {
    console.error(error.message);
    if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Некорректный JSON в запросе." });
    if ([2601, 2627].includes(error.number)) return res.status(409).json({ message: "Категория с таким названием уже существует." });
    if (error.number === 547) return res.status(400).json({ message: "Выбранная категория или купон не существуют." });
    res.status(500).json({ message: "Ошибка API или базы данных. Проверьте подключение к SQL Server." });
  });
  return app;
}
