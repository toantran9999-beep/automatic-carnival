import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  unique,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tableStatusEnum, sessionStatusEnum } from "./enums";
import { organizations, branches } from "./tenants";
import { users } from "./auth";

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    floor_number: integer("floor_number").default(1).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("spaces_branch_name_unique").on(table.branch_id, table.name),
  ],
);

export const tables = pgTable(
  "tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    space_id: uuid("space_id").references(() => spaces.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    capacity: integer("capacity").default(4).notNull(),
    qr_code: varchar("qr_code", { length: 100 }).unique().notNull(),
    status: tableStatusEnum("status").default("available").notNull(),
    position_x: integer("position_x").default(0).notNull(),
    position_y: integer("position_y").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("tables_branch_number_unique").on(table.branch_id, table.number),
  ],
);

export const tableAssignments = pgTable("table_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  table_id: uuid("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_table_assignments_table_user").on(table.table_id, table.user_id),
]);

export const tableSessions = pgTable("table_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  table_id: uuid("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customer_name: varchar("customer_name", { length: 255 }).notNull(),
  customer_phone: varchar("customer_phone", { length: 20 }),
  token: text("token").notNull(),
  status: sessionStatusEnum("status").default("active").notNull(),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
}, (table) => [
  index("idx_sessions_table_status").on(table.table_id, table.status),
  index("idx_sessions_branch").on(table.branch_id),
]);

export const tableSessionEvents = pgTable("table_session_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organization_id: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branch_id: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  actor_user_id: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: varchar("action", { length: 40 }).notNull(),
  source_session_id: uuid("source_session_id").references(() => tableSessions.id, {
    onDelete: "set null",
  }),
  target_session_id: uuid("target_session_id").references(() => tableSessions.id, {
    onDelete: "set null",
  }),
  source_table_id: uuid("source_table_id").references(() => tables.id, {
    onDelete: "set null",
  }),
  target_table_id: uuid("target_table_id").references(() => tables.id, {
    onDelete: "set null",
  }),
  metadata: jsonb("metadata").default({}).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_table_session_events_branch_created").on(table.branch_id, table.created_at),
  index("idx_table_session_events_source").on(table.source_session_id),
  index("idx_table_session_events_target").on(table.target_session_id),
]);
