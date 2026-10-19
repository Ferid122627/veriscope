import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const USER_ROLES = ["user", "company"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// "user" is a normal account without company rules; "company" can manage and
// is checked against the company rules.
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof usersTable.$inferSelect;
