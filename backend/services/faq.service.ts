import { Prisma } from "@prisma/client";
import { db } from "../lib/db.js";
import type { faqQuerySchema } from "../validators/faq.js";
import type { z } from "zod";

type FAQQuery = z.infer<typeof faqQuerySchema>;

function mapFaq(row: { id: string; question: string; answer: string; category: string; displayOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function faqWhere(query: FAQQuery, admin = false): Prisma.FAQWhereInput {
  const where: Prisma.FAQWhereInput = admin && query.includeInactive ? {} : { isActive: true };
  if (query.category) where.category = query.category;
  if (query.q) {
    where.OR = [
      { question: { contains: query.q } },
      { answer: { contains: query.q } },
      { category: { contains: query.q } },
    ];
  }
  return where;
}

export async function listFaqs(query: FAQQuery = {}, admin = false) {
  const rows = await db.fAQ.findMany({
    where: faqWhere(query, admin),
    orderBy: [{ category: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(mapFaq);
}

export async function createFaq(input: { question: string; answer: string; category: string; displayOrder: number; isActive: boolean }) {
  const row = await db.fAQ.create({ data: input });
  return mapFaq(row);
}

export async function updateFaq(id: string, input: Partial<{ question: string; answer: string; category: string; displayOrder: number; isActive: boolean }>) {
  const row = await db.fAQ.update({ where: { id }, data: input });
  return mapFaq(row);
}

export async function deleteFaq(id: string) {
  await db.fAQ.delete({ where: { id } });
}

export async function bulkUpdateFaqStatus(ids: string[], isActive: boolean) {
  await db.fAQ.updateMany({ where: { id: { in: ids } }, data: { isActive } });
  return listFaqs({ includeInactive: true }, true);
}
