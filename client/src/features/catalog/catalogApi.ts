import { apiClient } from "../../lib/apiClient";
import { ALL_COLLECTIONS, HOME_PREVIEW_PRODUCTS, HomeCollectionPreview, HomeProductPreview } from "../home/homeFixtures";

export interface Collection {
  id: number; slug: string; name: string; description: string | null; coverImage: string | null; isActive: boolean;
}

export interface Product {
  id: number; name: string; slug: string; price: string; stock: number; status: string;
  description: string | null; story: string | null; craftTechnique: string | null;
  isFeatured: boolean; shapeOptions: string[]; lengthOptions: string[]; colorPalette: string[];
  releasedAt: string;
  images: { id: number; imageUrl: string; isPrimary: boolean }[];
  collections: { collection: Collection }[];
}

export const catalogChanged = "atelier:catalog-changed";
const fallbackImage = "/images/atelier-silk-prism.jpg";
const collectionDesigns = new Map(ALL_COLLECTIONS.map(c => [c.slug, c]));
const productDesigns = new Map(HOME_PREVIEW_PRODUCTS.map(p => [p.slug, p]));
const productSlugsByOriginalImage = new Map(HOME_PREVIEW_PRODUCTS.map(p => [p.primaryImage, p.slug]));

export async function loadCatalog(signal: AbortSignal) {
  const [products, collections] = await Promise.all([
    apiClient.get<Product[]>("/products", { signal }),
    apiClient.get<Collection[]>("/collections", { signal }),
  ]);
  const productPreviews = products.data.map((p): HomeProductPreview => {
    const design = productDesigns.get(p.slug);
    const image = (p.images.find(i => i.isPrimary) ?? p.images[0])?.imageUrl || fallbackImage;
    const collection = p.collections.find(c => c.collection.isActive)?.collection;
    const isNew = Date.now() - Date.parse(p.releasedAt) < 30 * 86400000;
    const category = design?.category ?? (/bridal|cưới/i.test(`${p.name} ${collection?.name ?? ""}`) ? "BRIDAL" : isNew ? "NEW" : "EDITORIAL");
    return { id: String(p.id), slug: p.slug, name: p.name, price: Number(p.price), stock: p.stock,
      shortDescription: p.description ?? "", subtitle: p.description || design?.subtitle || "", category,
      badge: p.stock === 0 ? "Hết hàng" : design?.badge ?? (isNew ? "Mới ra mắt" : ""),
      storyTitle: design?.storyTitle ?? p.name, story: p.story ?? p.description ?? "",
      technique: p.craftTechnique ?? "", occasion: "", isNew, featured: p.isFeatured,
      collectionName: collection?.name ?? "", collectionSlug: collection?.slug ?? "", image, primaryImage: image,
      shapeOptions: p.shapeOptions, lengthOptions: p.lengthOptions, colorPalette: p.colorPalette };
  });
  return {
    products: productPreviews,
    collections: collections.data.map((c): HomeCollectionPreview => {
      const design = collectionDesigns.get(c.slug);
      const accentSlug = design && productSlugsByOriginalImage.get(design.accentImage);
      const accentProduct = accentSlug ? productPreviews.find(p => p.slug === accentSlug) : undefined;
      const coverImage = c.coverImage || design?.coverImage || fallbackImage;
      return {
        id: String(c.id), slug: c.slug, name: c.name, storyTitle: design?.storyTitle ?? c.name,
        description: c.description ?? "", story: design?.story ?? c.description ?? "",
        coverImage, accentImage: accentProduct?.primaryImage || design?.accentImage || coverImage,
        palette: design?.palette ?? [], techniqueSummary: design?.techniqueSummary ?? "",
      };
    }),
  };
}
