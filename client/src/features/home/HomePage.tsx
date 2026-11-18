import React from "react";
import { BrandStorySection } from "./components/BrandStorySection";
import { CollectionStorySection } from "./components/CollectionStorySection";
import { CustomDesignCTA } from "./components/CustomDesignCTA";
import { FeaturedProductsSection } from "./components/FeaturedProductsSection";
import { HeroCinematic } from "./components/HeroCinematic";
import { useStudio } from "../../app/StudioContext";
import { HOME_PREVIEW_COLLECTION, HOME_PREVIEW_PRODUCTS } from "./homeFixtures";
import "./home.css";

const originalOrder = new Map(HOME_PREVIEW_PRODUCTS.map((p, index) => [p.slug, index]));

export const HomePage: React.FC = () => {
  const { products, collections } = useStudio();
  const featured = products.filter(product => product.featured);
  const showcase = [...(featured.length ? featured : products)]
    .sort((a, b) => (originalOrder.get(a.slug) ?? originalOrder.size) - (originalOrder.get(b.slug) ?? originalOrder.size))
    .slice(0, 4);
  const collection = collections.find(c => c.slug === HOME_PREVIEW_COLLECTION.slug) ?? collections[0];
  return (
    <div>
      <HeroCinematic />
      <FeaturedProductsSection products={showcase} />
      {collection && <CollectionStorySection collection={collection} />}
      <BrandStorySection />
      <CustomDesignCTA />
    </div>
  );
};
