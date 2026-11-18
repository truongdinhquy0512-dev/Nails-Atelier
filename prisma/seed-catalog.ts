import 'dotenv/config';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NailLength, NailShape, PrismaClient } from '@prisma/client';
import { ALL_COLLECTIONS, HOME_PREVIEW_PRODUCTS } from '../client/src/features/home/homeFixtures';

const prisma = new PrismaClient();
const stock = new Map([
  ['l-aurore-de-perle', 24],
  ['veine-d-or-rose', 6],
  ['orchidee-de-velours', 12],
  ['ruban-de-porcelaine', 15],
]);

function variant<T extends string>(label: string, allowed: Record<T, T>): T {
  const key = label.toUpperCase().replace(/\s+/g, '_') as T;
  if (!Object.hasOwn(allowed, key)) throw new Error(`Biến thể mẫu không hợp lệ: ${label}`);
  return allowed[key];
}

async function seedCatalog() {
  const images = new Set([
    ...ALL_COLLECTIONS.map(collection => collection.coverImage),
    ...HOME_PREVIEW_PRODUCTS.map(product => product.primaryImage),
  ]);
  await Promise.all([...images].map(url => access(resolve('client/public', `.${url}`))));

  const result = await prisma.$transaction(async tx => {
    const collectionIds = new Map<string, number>();
    let collectionsAdded = 0;
    let productsAdded = 0;
    for (const [sortOrder, collection] of ALL_COLLECTIONS.entries()) {
      const existing = await tx.collection.findUnique({ where: { slug: collection.slug }, select: { id: true } });
      const saved = existing ?? await tx.collection.create({
        data: { slug: collection.slug, name: collection.name, sortOrder,
          description: `${collection.description}\n\n${collection.story}`, coverImage: collection.coverImage },
        select: { id: true },
      });
      collectionIds.set(collection.slug, saved.id);
      if (!existing) collectionsAdded++;
    }
    for (const product of HOME_PREVIEW_PRODUCTS) {
      if (await tx.product.findUnique({ where: { slug: product.slug }, select: { id: true } })) continue;
      const collectionId = collectionIds.get(product.collectionSlug);
      if (collectionId === undefined) throw new Error(`Thiếu bộ sưu tập: ${product.collectionSlug}`);
      await tx.product.create({
        data: {
          slug: product.slug, name: product.name, description: product.shortDescription,
          price: product.price, stock: stock.get(product.slug) ?? 10, status: 'ACTIVE', isFeatured: product.featured,
          story: product.story, craftTechnique: product.technique, colorPalette: product.colorPalette,
          releasedAt: new Date(Date.now() - (product.isNew ? 0 : 45 * 86400000)),
          shapeOptions: product.shapeOptions.map(shape => variant(shape, NailShape)),
          lengthOptions: product.lengthOptions.map(length => variant(length, NailLength)),
          collections: { create: { collectionId } },
          images: { create: { imageUrl: product.primaryImage, altText: product.name, isPrimary: true } },
        },
      });
      productsAdded++;
    }
    return { collectionsAdded, productsAdded };
  });
  console.log(`Đã thêm ${result.collectionsAdded} bộ sưu tập và ${result.productsAdded} sản phẩm mẫu. Bản ghi trùng slug được giữ nguyên.`);
}

void seedCatalog().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
