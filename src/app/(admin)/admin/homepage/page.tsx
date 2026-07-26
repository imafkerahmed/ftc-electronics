"use client";

import React, { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  LayoutTemplate,
  Save,
  GripVertical,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  pbHomepageBlocks,
  pbHeroBanners,
  pbCategories,
  pbBrands,
} from "@/lib/pb-collections";
import {
  updateHomepageBlocksAction,
  updateHomepageBlockConfigAction,
  createHomepageBlockAction,
  deleteHomepageBlockAction,
  createHeroBannerAction,
  updateHeroBannerAction,
  deleteHeroBannerAction,
  reorderHeroBannersAction,
  updateBrandAction,
} from "@/app/actions/admin";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { X } from "lucide-react";

interface HomepageBlock {
  id: string;
  type: string;
  title: string;
  isEnabled: boolean;
  sortOrder: number;
  config?: Record<string, unknown>;
}

interface HeroSlideDraft {
  id?: string;
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  secondaryLink?: string;
  accentColor?: string;
  /** Existing PocketBase file URL (already uploaded) */
  imageUrl?: string;
  /** New file selected by the user — uploaded on save */
  imageFile?: File;
  imageAlt?: string;
  sortOrder?: number;
}

/**
 * Extract dominant vibrant color from an image File or URL using HTML5 Canvas.
 */
function extractDominantColor(fileOrUrl: File | string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve("#111827");
      return;
    }

    const img = document.createElement("img");
    img.crossOrigin = "Anonymous";

    const objectUrl =
      typeof fileOrUrl === "string"
        ? fileOrUrl
        : URL.createObjectURL(fileOrUrl);

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("#111827");
          return;
        }

        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0, 64, 64);

        const imageData = ctx.getImageData(0, 0, 64, 64).data;
        const colorCounts: Record<string, number> = {};
        let maxCount = 0;
        let dominantHex = "#111827";

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];

          // Skip transparent, dark, or low-saturation greys
          if (a < 128) continue;
          const maxRGB = Math.max(r, g, b);
          const minRGB = Math.min(r, g, b);
          const saturation = maxRGB > 0 ? (maxRGB - minRGB) / maxRGB : 0;

          if (saturation < 0.15 || maxRGB < 35 || minRGB > 230) continue;

          const qr = Math.round(r / 20) * 20;
          const qg = Math.round(g / 20) * 20;
          const qb = Math.round(b / 20) * 20;

          const key = `${qr},${qg},${qb}`;
          colorCounts[key] = (colorCounts[key] || 0) + 1;

          if (colorCounts[key] > maxCount) {
            maxCount = colorCounts[key];
            dominantHex = `#${((1 << 24) + (qr << 16) + (qg << 8) + qb)
              .toString(16)
              .slice(1)}`;
          }
        }

        resolve(dominantHex);
      } catch {
        resolve("#111827");
      }
    };

    img.onerror = () => resolve("#111827");
    img.src = objectUrl;
  });
}

const createHeroSlideDraft = (
  slide?: Partial<HeroSlideDraft>,
  index = 0,
): HeroSlideDraft => ({
  eyebrow: "",
  titlePrefix: "",
  titleHighlight: "",
  description: "",
  ctaText: "Shop now",
  ctaSecondary: "",
  link: "/products",
  secondaryLink: "",
  accentColor: "#111827",
  imageUrl: undefined,
  imageAlt: "",
  sortOrder: index,
  ...slide,
});

export default function AdminHomepageBuilderPage() {
  const [blocks, setBlocks] = useState<HomepageBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Config editor state
  const [editingBlock, setEditingBlock] = useState<HomepageBlock | null>(null);
  const [configText, setConfigText] = useState("");
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const configFormRef = useRef<HTMLFormElement>(null);

  // Hero banner editor state
  const [isHeroModalOpen, setIsHeroModalOpen] = useState(false);
  const [heroEditingBlock, setHeroEditingBlock] =
    useState<HomepageBlock | null>(null);
  const [heroSlides, setHeroSlides] = useState<HeroSlideDraft[]>([]);
  const [heroBannerList, setHeroBannerList] = useState<HeroSlideDraft[]>([]);

  // Add Block State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newBlockType, setNewBlockType] = useState("product-carousel");
  const [newBlockConfig, setNewBlockConfig] = useState("{}");
  const [newBlockVisibility, setNewBlockVisibility] = useState("all");
  const [newBlockStart, setNewBlockStart] = useState("");
  const [newBlockEnd, setNewBlockEnd] = useState("");

  // Categories & Brands for Product Section builder
  const [availableCategories, setAvailableCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [availableBrands, setAvailableBrands] = useState<
    { id: string; name: string; slug: string; show_in_strip: boolean; logoUrl: string | null }[]
  >([]);

  // Product Carousel visual form states
  const [productSource, setProductSource] = useState<string>("newest");
  const [productCategory, setProductCategory] = useState<string>("");
  const [productBrand, setProductBrand] = useState<string>("");
  const [productLimit, setProductLimit] = useState<number>(8);
  const [productRows, setProductRows] = useState<number>(1);
  const [productLayout, setProductLayout] = useState<string>("featured-grid");
  const [productSeeAll, setProductSeeAll] = useState<string>("");
  const [productDescription, setProductDescription] = useState<string>("");
  const [productTitleColor, setProductTitleColor] = useState<string>("");

  // Bento Grid Category Builder state (4 slots)
  interface BentoSlotDraft {
    slug: string;
    title: string;
    description: string;
    label: string;
    mediaType: "image" | "video";
    mediaUrl: string;
  }

  const [bentoSlots, setBentoSlots] = useState<BentoSlotDraft[]>([
    { slug: "laptops", title: "", description: "", label: "LAPTOPS", mediaType: "image", mediaUrl: "" },
    { slug: "keyboards", title: "", description: "", label: "KEYBOARDS", mediaType: "image", mediaUrl: "" },
    { slug: "audio", title: "", description: "", label: "AUDIO", mediaType: "image", mediaUrl: "" },
    { slug: "phones", title: "", description: "", label: "SMARTPHONES", mediaType: "image", mediaUrl: "" },
  ]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [categoryGridBgImage, setCategoryGridBgImage] = useState<string>("");

  // Drag state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [draggedBannerIdx, setDraggedBannerIdx] = useState<number | null>(null);

  const handleBannerDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBannerIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleBannerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleBannerDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedBannerIdx === null || draggedBannerIdx === targetIndex) return;

    const reordered = [...heroBannerList];
    const [moved] = reordered.splice(draggedBannerIdx, 1);
    reordered.splice(targetIndex, 0, moved);

    setHeroBannerList(reordered);
    setDraggedBannerIdx(null);

    startTransition(async () => {
      const items = reordered
        .filter((item) => Boolean(item.id))
        .map((item, idx) => ({ id: item.id!, sortOrder: idx }));
      await reorderHeroBannersAction(items);
      loadData();
    });
  };

  // Accordion state (only one block expanded at a time)
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  const toggleAccordion = (id: string) => {
    setExpandedBlockId((prev) => (prev === id ? null : id));
  };

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isAddModalOpen || isConfigModalOpen || isHeroModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAddModalOpen, isConfigModalOpen, isHeroModalOpen]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await pbHomepageBlocks.getAll();
      const heroRecords = await pbHeroBanners.getAll().catch(() => []);

      setBlocks(
        (res || []).map((b: any) => ({
          id: b.id,
          type: b.type || b.block_type || "section",
          title: b.title || "Page Section",
          isEnabled: b.isEnabled !== false && b.is_active !== false,
          sortOrder: b.sortOrder || 0,
          config: b.config || {},
        })),
      );

      // Pre-fetch categories & brands for Product Section Builder
      const [cats, brs] = await Promise.all([
        pbCategories.getAll().catch(() => []),
        pbBrands.getAll().catch(() => []),
      ]);
      setAvailableCategories(
        cats.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug || c.id,
        })),
      );
      const pbUrl =
        process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://ftc-db.codix.site/";
      setAvailableBrands(
        brs.map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug || b.id,
          show_in_strip: b.show_in_strip || false,
          logoUrl: b.logo ? `${pbUrl.replace(/\/$/, "")}/api/files/${b.collectionId}/${b.id}/${b.logo}` : null,
        })),
      );

      const bannersFromCollection = heroRecords.length
        ? heroRecords.map((banner, index) => {
            const imageUrl = banner.image
              ? `${pbUrl.replace(/\/$/, "")}/api/files/${banner.collectionId}/${banner.id}/${banner.image}`
              : undefined;
            return createHeroSlideDraft(
              {
                id: banner.id,
                eyebrow: banner.eyebrow,
                titlePrefix: banner.titlePrefix,
                titleHighlight: banner.titleHighlight,
                description: banner.description,
                ctaText: banner.ctaText,
                ctaSecondary: banner.ctaSecondary,
                link: banner.link,
                secondaryLink: banner.secondaryLink,
                accentColor: banner.accentColor,
                imageUrl,
                imageAlt: banner.imageAlt,
                sortOrder: banner.sortOrder,
              },
              index,
            );
          })
        : [];

      setHeroBannerList(bannersFromCollection);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const heroBannerBlock =
    blocks.find((block) => block.type === "hero-banner") || null;

  const handleOpenAddHeroBanner = () => {
    setNewBlockTitle("Homepage Hero Banner");
    setNewBlockType("hero-banner");
    setHeroSlides(
      heroBannerList.length
        ? heroBannerList.map((slide, index) =>
            createHeroSlideDraft(slide, index),
          )
        : [createHeroSlideDraft()],
    );
    setNewBlockVisibility("all");
    setNewBlockStart("");
    setNewBlockEnd("");
    setIsAddModalOpen(true);
  };

  const handleToggleBlock = (id: string) => {
    const updated = blocks.map((b) =>
      b.id === id ? { ...b, isEnabled: !b.isEnabled } : b,
    );
    setBlocks(updated);

    startTransition(async () => {
      const payload = updated.map((b, idx) => ({
        id: b.id,
        isEnabled: b.isEnabled,
        sortOrder: idx + 1,
      }));
      const res = await updateHomepageBlocksAction(payload);
      if (res.success) {
        setSuccess("Storefront visibility updated.");
      } else {
        setError(res.error || "Failed to update storefront visibility.");
        void loadData();
      }
    });
  };

  const handleMoveBlock = (indexInNonHero: number, direction: -1 | 1) => {
    const nonHeroBlocks = blocks.filter((b) => b.type !== "hero-banner");
    const targetIdx = indexInNonHero + direction;
    if (targetIdx < 0 || targetIdx >= nonHeroBlocks.length) return;

    const reorderedNonHero = [...nonHeroBlocks];
    const [moved] = reorderedNonHero.splice(indexInNonHero, 1);
    reorderedNonHero.splice(targetIdx, 0, moved);

    const heroBlocks = blocks.filter((b) => b.type === "hero-banner");
    const updatedFullList = [...heroBlocks, ...reorderedNonHero];

    setBlocks(updatedFullList);

    startTransition(async () => {
      const payload = updatedFullList.map((b, idx) => ({
        id: b.id,
        isEnabled: b.isEnabled,
        sortOrder: idx + 1,
      }));
      const res = await updateHomepageBlocksAction(payload);
      if (res.success) {
        setSuccess("Homepage section order updated.");
      } else {
        setError(res.error || "Failed to update section order.");
        void loadData();
      }
    });
  };

  const handleDragStart = (e: React.DragEvent, indexInNonHero: number) => {
    setDraggedIdx(indexInNonHero);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndexInNonHero: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndexInNonHero) return;

    const nonHeroBlocks = blocks.filter((b) => b.type !== "hero-banner");
    const reorderedNonHero = [...nonHeroBlocks];
    const [moved] = reorderedNonHero.splice(draggedIdx, 1);
    reorderedNonHero.splice(targetIndexInNonHero, 0, moved);

    const heroBlocks = blocks.filter((b) => b.type === "hero-banner");
    const updatedFullList = [...heroBlocks, ...reorderedNonHero];

    setBlocks(updatedFullList);
    setDraggedIdx(null);

    startTransition(async () => {
      const payload = updatedFullList.map((b, idx) => ({
        id: b.id,
        isEnabled: b.isEnabled,
        sortOrder: idx + 1,
      }));
      const res = await updateHomepageBlocksAction(payload);
      if (res.success) {
        setSuccess("Homepage section order saved.");
      } else {
        setError(res.error || "Failed to update section order.");
        void loadData();
      }
    });
  };

  const handleOpenConfig = (block: HomepageBlock) => {
    if (block.type === "hero-banner") {
      handleOpenHeroEditor(block);
      return;
    }
    setEditingBlock(block);
    setConfigText(JSON.stringify(block.config || {}, null, 2));

    // Populate visual product carousel form states
    if (block.type === "product-carousel") {
      const cfg = block.config || {};
      setProductSource(String(cfg.source || "newest"));
      setProductCategory(String(cfg.category || cfg.value || ""));
      setProductBrand(String(cfg.brand || cfg.value || ""));
      setProductLimit(Number(cfg.limit) || 8);
      setProductRows(Number(cfg.rows) || (Number(cfg.limit) ? Math.ceil(Number(cfg.limit) / 5) : 1));
      setProductLayout(String(cfg.layout || "featured-grid"));
      setProductSeeAll(String(cfg.seeAllLink || ""));
      setProductDescription(String(cfg.description || ""));
      setProductTitleColor(String(cfg.titleColor || ""));
    }

    if (block.type === "category-grid") {
      const cfg: Record<string, any> = (block.config as any) || {};
      setCategoryGridBgImage(String(cfg.sectionBackgroundImage || cfg.backgroundImage || ""));
      setBentoSlots([
        {
          slug: cfg.slot1?.slug || "laptops",
          title: cfg.slot1?.title || "",
          description: cfg.slot1?.description || "",
          label: cfg.slot1?.label || "LAPTOPS",
          mediaType: cfg.slot1?.mediaType || "image",
          mediaUrl: cfg.slot1?.mediaUrl || cfg.slot1?.imageUrl || "",
        },
        {
          slug: cfg.slot2?.slug || "keyboards",
          title: cfg.slot2?.title || "",
          description: cfg.slot2?.description || "",
          label: cfg.slot2?.label || "KEYBOARDS",
          mediaType: cfg.slot2?.mediaType || "image",
          mediaUrl: cfg.slot2?.mediaUrl || cfg.slot2?.imageUrl || "",
        },
        {
          slug: cfg.slot3?.slug || "audio",
          title: cfg.slot3?.title || "",
          description: cfg.slot3?.description || "",
          label: cfg.slot3?.label || "AUDIO",
          mediaType: cfg.slot3?.mediaType || "image",
          mediaUrl: cfg.slot3?.mediaUrl || cfg.slot3?.imageUrl || "",
        },
        {
          slug: cfg.slot4?.slug || "phones",
          title: cfg.slot4?.title || "",
          description: cfg.slot4?.description || "",
          label: cfg.slot4?.label || "SMARTPHONES",
          mediaType: cfg.slot4?.mediaType || "image",
          mediaUrl: cfg.slot4?.mediaUrl || cfg.slot4?.imageUrl || "",
        },
      ]);
      setActiveSlotIdx(0);
    }

    setError(null);
    setSuccess(null);
    setIsConfigModalOpen(true);
  };
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(
    null,
  );

  const handleOpenHeroSlideEditor = (index: number) => {
    setEditingSlideIndex(index);
    const existing = heroBannerList[index];
    if (existing) {
      setHeroSlides([createHeroSlideDraft(existing, index)]);
    }
    setError(null);
    setSuccess(null);
    setIsHeroModalOpen(true);
  };

  const handleAddNewBannerSlide = () => {
    setEditingSlideIndex(null);
    setHeroSlides([createHeroSlideDraft(undefined, heroBannerList.length)]);
    setError(null);
    setSuccess(null);
    setIsHeroModalOpen(true);
  };

  const handleOpenHeroEditor = (block: HomepageBlock) => {
    const slidesFromConfig = Array.isArray(block.config?.slides)
      ? (block.config.slides as unknown[])
      : [];
    setHeroEditingBlock(block);
    setHeroSlides(
      heroBannerList.length > 0
        ? heroBannerList.map((slide, index) =>
            createHeroSlideDraft(slide, index),
          )
        : slidesFromConfig.length > 0
          ? slidesFromConfig.map((slide, index) =>
              createHeroSlideDraft(slide as Partial<HeroSlideDraft>, index),
            )
          : [createHeroSlideDraft()],
    );
    setError(null);
    setSuccess(null);
    setIsHeroModalOpen(true);
  };

  const updateHeroSlide = (
    index: number,
    field: keyof HeroSlideDraft,
    value: any,
  ) => {
    setHeroSlides((prev) =>
      prev.map((slide, slideIndex) =>
        slideIndex === index ? { ...slide, [field]: value } : slide,
      ),
    );
  };

  const handleImageUploadAndAutoColor = async (index: number, file: File) => {
    updateHeroSlide(index, "imageFile", file);
    const color = await extractDominantColor(file);
    if (color && color !== "#111827") {
      updateHeroSlide(index, "accentColor", color);
    }
  };

  const handleAutoExtractColor = async (index: number) => {
    const slide = heroSlides[index];
    const source = slide?.imageFile || slide?.imageUrl;
    if (!source) return;
    const color = await extractDominantColor(source);
    if (color && color !== "#111827") {
      updateHeroSlide(index, "accentColor", color);
    }
  };

  const handleDeleteBannerSlide = async (index: number) => {
    const slideToDelete = heroBannerList[index];
    startTransition(async () => {
      if (slideToDelete?.id) {
        await deleteHeroBannerAction(slideToDelete.id);
        setSuccess(`Banner slide deleted.`);
        loadData();
      }
    });
  };

  const handleReorderBannerSlide = async (index: number, direction: -1 | 1) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= heroBannerList.length) return;

    const list = [...heroBannerList];
    const [moved] = list.splice(index, 1);
    list.splice(nextIdx, 0, moved);

    setHeroBannerList(list);

    startTransition(async () => {
      const items = list
        .filter((item) => Boolean(item.id))
        .map((item, idx) => ({ id: item.id!, sortOrder: idx }));
      await reorderHeroBannersAction(items);
      loadData();
    });
  };

  const handleSaveHeroConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const slideToSave = heroSlides[0];
    if (!slideToSave) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("eyebrow", (slideToSave.eyebrow || "").trim());
      fd.append("titlePrefix", slideToSave.titlePrefix || "");
      fd.append("titleHighlight", (slideToSave.titleHighlight || "").trim());
      fd.append("description", slideToSave.description || "");
      fd.append("ctaText", slideToSave.ctaText || "Shop now");
      fd.append("ctaSecondary", slideToSave.ctaSecondary || "");
      fd.append("link", slideToSave.link || "/products");
      fd.append("secondaryLink", slideToSave.secondaryLink || "");
      fd.append("accentColor", slideToSave.accentColor || "#111827");
      fd.append("imageAlt", slideToSave.imageAlt || "");
      fd.append("isEnabled", "true");

      if (slideToSave.imageFile) {
        fd.append("image", slideToSave.imageFile);
      }

      if (editingSlideIndex !== null && heroBannerList[editingSlideIndex]?.id) {
        const targetId = heroBannerList[editingSlideIndex].id;
        fd.append("sortOrder", String(editingSlideIndex));
        const res = await updateHeroBannerAction(targetId, fd);
        if (res.success) {
          setSuccess(
            `Banner slide ${editingSlideIndex + 1} updated successfully.`,
          );
        } else {
          setError(res.error || "Failed to update hero banner slide.");
        }
      } else {
        fd.append("sortOrder", String(heroBannerList.length));
        const res = await createHeroBannerAction(fd);
        if (res.success) {
          setSuccess("New hero banner slide created successfully.");
        } else {
          setError(res.error || "Failed to create hero banner slide.");
        }
      }

      setIsHeroModalOpen(false);
      loadData();
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!editingBlock) return;

    let parsedConfig = {};
    if (editingBlock.type === "product-carousel") {
      parsedConfig = {
        source: productSource,
        category: productSource === "category" ? productCategory : undefined,
        brand: productSource === "brand" ? productBrand : undefined,
        rows: productRows,
        limit: productLayout === "featured-grid" ? productRows * 5 : productLimit,
        layout: productLayout,
        seeAllLink: productSeeAll || undefined,
        description: productDescription || undefined,
        titleColor: productTitleColor || undefined,
      };
    } else if (editingBlock.type === "category-grid") {
      parsedConfig = {
        sectionBackgroundImage: categoryGridBgImage || undefined,
        slot1: bentoSlots[0],
        slot2: bentoSlots[1],
        slot3: bentoSlots[2],
        slot4: bentoSlots[3],
      };
    } else {
      parsedConfig = editingBlock.config || {};
    }

    startTransition(async () => {
      const res = await updateHomepageBlockConfigAction(
        editingBlock.id,
        parsedConfig,
      );
      if (res.success) {
        setSuccess(
          `Configuration for '${editingBlock.title}' saved successfully.`,
        );
        setIsConfigModalOpen(false);
        loadData();
      } else {
        setError(res.error || "Failed to save block configuration.");
      }
    });
  };

  const handleConfigModalToggleBrandStrip = async (
    brand: { id: string; name: string; slug: string; show_in_strip?: boolean },
    checked: boolean
  ) => {
    setError(null);
    setSuccess(null);

    // Optimistically update local availableBrands state
    setAvailableBrands((prev) =>
      prev.map((b) => (b.id === brand.id ? { ...b, show_in_strip: checked } : b))
    );

    const formData = new FormData();
    formData.append("name", brand.name);
    formData.append("slug", brand.slug);
    formData.append("show_in_strip", checked.toString());

    const res = await updateBrandAction(brand.id, formData);
    if (!res.success) {
      // Revert on failure
      setAvailableBrands((prev) =>
        prev.map((b) => (b.id === brand.id ? { ...b, show_in_strip: !checked } : b))
      );
      setError(res.error || "Failed to update brand visibility.");
    }
  };

  const handleSave = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const payload = blocks.map((b, idx) => ({
        id: b.id,
        isEnabled: b.isEnabled,
        sortOrder: idx + 1,
      }));

      const res = await updateHomepageBlocksAction(payload);
      if (res.success) {
        setSuccess("Homepage layout configurations saved successfully.");
        loadData();
      } else {
        setError(res.error || "Failed to save homepage layout.");
      }
    });
  };

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedConfig =
      newBlockType === "hero-banner"
        ? { slides: [] }
        : (() => {
            try {
              return JSON.parse(newBlockConfig || "{}");
            } catch {
              setError("Block configuration must be a valid JSON.");
              return null;
            }
          })();

    if (!parsedConfig) {
      return;
    }

    startTransition(async () => {
      const res = await createHomepageBlockAction({
        type: newBlockType,
        title: newBlockTitle,
        config: parsedConfig,
        isEnabled: true,
        sortOrder: blocks.length,
        deviceVisibility: newBlockVisibility,
        scheduledStart: newBlockStart,
        scheduledEnd: newBlockEnd,
      });

      if (res.success) {
        setSuccess(`Block '${newBlockTitle}' created successfully.`);
        setIsAddModalOpen(false);
        setNewBlockTitle("");
        setNewBlockType("product-carousel");
        setNewBlockConfig("");
        loadData();
      } else {
        setError(res.error || "Failed to create homepage block.");
      }
    });
  };

  const handleDeleteBlock = async (id: string) => {
    if (!confirm("Are you sure you want to delete this homepage block?"))
      return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await deleteHomepageBlockAction(id);
      if (res.success) {
        setSuccess("Block deleted successfully.");
        loadData();
      } else {
        setError(res.error || "Failed to delete block.");
      }
    });
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Feedback Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-blue-500" />
            Homepage Layout Builder
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Reorder page blocks and toggle visibility on the storefront.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            size="sm"
            variant="outline"
            className="border-border text-foreground font-semibold flex items-center gap-1.5 h-9"
          >
            <Plus className="h-4 w-4" /> Add Block
          </Button>
          <Button
            onClick={handleSave}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 h-9"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Hero Banner Editor Section (Accordion) */}
      {heroBannerBlock && (
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-md overflow-hidden transition-all">
          {/* Header (Click to toggle expansion) */}
          <div
            onClick={() => toggleAccordion(heroBannerBlock.id)}
            className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/40 transition-colors select-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200 ${
                  expandedBlockId === heroBannerBlock.id ? "rotate-180" : ""
                }`}
              />
              <span className="text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded shrink-0">
                hero-banner
              </span>
              <h2 className="text-sm font-bold tracking-wide text-foreground truncate">
                {heroBannerBlock.title || "Hero Banner Manager"}
              </h2>
              <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted border border-border/60 shrink-0">
                {heroBannerList.length} slide
                {heroBannerList.length === 1 ? "" : "s"}
              </span>
            </div>

            <div
              className="flex items-center gap-2.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1.5 bg-background border border-border px-2.5 py-1 rounded-lg">
                <span className="text-xs font-semibold text-muted-foreground">
                  Storefront:
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleBlock(heroBannerBlock.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center"
                  title={
                    heroBannerBlock.isEnabled
                      ? "Section Active on Storefront"
                      : "Section Hidden on Storefront"
                  }
                >
                  {heroBannerBlock.isEnabled ? (
                    <ToggleRight className="h-6 w-6 text-blue-500" />
                  ) : (
                    <ToggleLeft className="h-6 w-6" />
                  )}
                </button>
              </div>

              <Button
                onClick={handleAddNewBannerSlide}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Hero Banner
              </Button>

              <button
                type="button"
                onClick={() => handleDeleteBlock(heroBannerBlock.id)}
                className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer p-1.5 bg-background border border-border hover:bg-red-500/10 rounded-lg"
                title="Delete Hero Banner Block"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Accordion Body */}
          {expandedBlockId === heroBannerBlock.id && (
            <div className="p-5 border-t border-border/80 bg-background/30 space-y-4">
              {heroBannerList.length > 0 ? (
                <div className="space-y-3">
                  {heroBannerList.map((slide, index) => (
                    <div
                      key={slide.id || `banner-slide-${index}`}
                      draggable
                      onDragStart={(e) => handleBannerDragStart(e, index)}
                      onDragOver={handleBannerDragOver}
                      onDrop={(e) => handleBannerDrop(e, index)}
                      className={`flex items-center justify-between gap-4 rounded-xl border border-border bg-background/80 p-3.5 shadow-2xs hover:border-blue-500/30 transition-all ${
                        draggedBannerIdx === index
                          ? "opacity-40 bg-muted/20 border-blue-500/30"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <GripVertical className="h-4 w-4 text-muted-foreground/45 cursor-grab shrink-0" />
                        {/* Thumbnail / Swatch */}
                        {slide.imageUrl || slide.imageFile ? (
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                            <img
                              src={
                                slide.imageFile
                                  ? URL.createObjectURL(slide.imageFile)
                                  : slide.imageUrl
                              }
                              alt={slide.imageAlt || "Banner preview"}
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                        ) : (
                          <div
                            className="w-14 h-14 rounded-lg border border-border flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase tracking-wider shadow-inner"
                            style={{
                              backgroundColor: slide.accentColor || "#111827",
                            }}
                          >
                            B{index + 1}
                          </div>
                        )}

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              Banner {index + 1}
                            </span>
                            {slide.eyebrow && (
                              <span className="text-[11px] font-semibold text-blue-500 truncate">
                                {slide.eyebrow}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-foreground truncate">
                            {slide.titleHighlight || "Untitled banner"}
                          </h4>
                          {slide.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {slide.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === 0 || isPending}
                          onClick={() =>
                            void handleReorderBannerSlide(index, -1)
                          }
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={
                            index === heroBannerList.length - 1 || isPending
                          }
                          onClick={() =>
                            void handleReorderBannerSlide(index, 1)
                          }
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Move Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenHeroSlideEditor(index)}
                          className="h-8 border-border text-xs font-semibold px-2.5"
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteBannerSlide(index)}
                          disabled={isPending}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          title="Delete banner"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3 bg-background/50">
                  <p className="text-xs text-muted-foreground">
                    No hero banners added yet. Click &quot;+ Add Hero
                    Banner&quot; to create your first banner slide.
                  </p>
                  <Button
                    type="button"
                    onClick={handleAddNewBannerSlide}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add First Banner
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Blocks reorder list */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading layout sections...
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.filter((b) => b.type !== "hero-banner").length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
              No additional layout blocks. Click &quot;Add Block&quot; to add
              section blocks like product carousels or promo banners.
            </div>
          ) : (
            blocks
              .filter((b) => b.type !== "hero-banner")
              .map((block, idx) => {
                const isExpanded = expandedBlockId === block.id;
                return (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`rounded-xl border bg-card/50 backdrop-blur-md overflow-hidden transition-all ${
                      block.isEnabled
                        ? "border-border"
                        : "border-dashed border-border/60 opacity-60"
                    } ${draggedIdx === idx ? "opacity-40 bg-muted/20 border-blue-500/30" : ""}`}
                  >
                    {/* Header (Click to toggle expansion) */}
                    <div
                      onClick={() => toggleAccordion(block.id)}
                      className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <GripVertical
                          className="h-4 w-4 text-muted-foreground/45 cursor-grab shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                        <span className="text-xs font-mono font-semibold uppercase px-1.5 py-0.5 bg-secondary/80 border border-border/80 rounded text-muted-foreground shrink-0">
                          {block.type}
                        </span>
                        <h4 className="font-bold text-foreground text-sm truncate">
                          {block.title}
                        </h4>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(idx, -1)}
                          disabled={idx === 0}
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded-md hover:bg-muted cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBlock(idx, 1)}
                          disabled={
                            idx ===
                            blocks.filter((b) => b.type !== "hero-banner")
                              .length -
                              1
                          }
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded-md hover:bg-muted cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>

                        <div className="h-4 w-[1px] bg-border mx-1" />

                        <button
                          onClick={() => handleOpenConfig(block)}
                          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1.5 hover:bg-muted rounded-md"
                          title="Configure Block Spec"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleBlock(block.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title={
                            block.isEnabled ? "Disable Block" : "Enable Block"
                          }
                        >
                          {block.isEnabled ? (
                            <ToggleRight className="h-6 w-6 text-blue-500" />
                          ) : (
                            <ToggleLeft className="h-6 w-6" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(block.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer p-1.5 hover:bg-muted rounded-md"
                          title="Delete Block"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Accordion Body */}
                    {isExpanded && (
                      <div className="p-4 border-t border-border/80 bg-background/40 space-y-3">
                        <div className="w-full space-y-2">
                          <span className="font-semibold text-xs text-foreground block">
                            Active Section Settings:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                            <div className="p-2.5 rounded-lg bg-background border border-border">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Section Source
                              </span>
                              <span className="font-semibold text-foreground capitalize">
                                {String(block.config?.source || "newest")}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-background border border-border">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Display Layout
                              </span>
                              <span className="font-semibold text-foreground capitalize">
                                {String(
                                  block.config?.layout || "featured-grid",
                                )}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-background border border-border truncate">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Target Link
                              </span>
                              <span className="font-semibold text-blue-500 truncate block">
                                {String(
                                  block.config?.seeAllLink || "/products",
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button
                            type="button"
                            onClick={() => handleOpenConfig(block)}
                            variant="outline"
                            size="sm"
                            className="text-xs flex items-center gap-1.5"
                          >
                            <Settings className="h-3.5 w-3.5" /> Configure
                            Section
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* Add Block Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full my-auto animate-scale-in transition-all duration-300">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                Add Homepage Block
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form
              onSubmit={handleAddBlock}
              className="p-5 space-y-4 max-h-[75vh] overflow-y-auto"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">
                  Block Title *
                </label>
                <Input
                  value={newBlockTitle}
                  onChange={(e) => setNewBlockTitle(e.target.value)}
                  required
                  placeholder="e.g. On-Sale Featured"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">
                  Block Type *
                </label>
                <select
                  value={newBlockType}
                  onChange={(e) => setNewBlockType(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="hero-banner">Hero Banner (hero-banner)</option>
                  <option value="product-carousel">
                    Product Carousel (product-carousel)
                  </option>
                  <option value="promo-banner">
                    Promo Banner (promo-banner)
                  </option>
                  <option value="brand-logo-strip">
                    Brand Logo Strip (brand-logo-strip)
                  </option>
                  <option value="category-grid">
                    Category Grid (category-grid)
                  </option>
                  <option value="reviews-carousel">
                    Reviews Carousel (reviews-carousel)
                  </option>
                  <option value="text-content">
                    Text Content / Value Props (text-content)
                  </option>
                  <option value="store-locator">
                    Store Locator Map (store-locator)
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">
                  Device Visibility
                </label>
                <select
                  value={newBlockVisibility}
                  onChange={(e) => setNewBlockVisibility(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="all">All Devices (all)</option>
                  <option value="desktop-only">
                    Desktop Only (desktop-only)
                  </option>
                  <option value="mobile-only">Mobile Only (mobile-only)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">
                    Visible From
                  </label>
                  <Input
                    type="datetime-local"
                    value={newBlockStart}
                    onChange={(e) => setNewBlockStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">
                    Visible Until
                  </label>
                  <Input
                    type="datetime-local"
                    value={newBlockEnd}
                    onChange={(e) => setNewBlockEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-muted-foreground border border-border"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> Add Block
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Editor Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full my-auto animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Configure {editingBlock?.title}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Type: {editingBlock?.type}
                </p>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form
              ref={configFormRef}
              onSubmit={handleSaveConfig}
              className="p-5 space-y-4 max-h-[75vh] overflow-y-auto"
            >
              {editingBlock?.type === "product-carousel" ? (
                <div className="space-y-4">
                  {/* Product Source Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 block">
                      Product Section Type
                    </label>
                    <select
                      value={productSource}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProductSource(val);
                        if (val === "on-sale")
                          setProductSeeAll("/products?filter=on-sale");
                        else if (val === "newest")
                          setProductSeeAll("/products?sortBy=newest");
                        else if (val === "limited-stock")
                          setProductSeeAll("/products?filter=low-stock");
                      }}
                      className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="newest">✨ New Arrivals (newest)</option>
                      <option value="on-sale">🏷️ On Sale (on-sale)</option>
                      <option value="category">
                        📁 Category Spotlight (category)
                      </option>
                      <option value="brand">⚡ Brand Showcase (brand)</option>
                      <option value="limited-stock">
                        ⏳ Limited Stock / Low Stock (limited-stock)
                      </option>
                    </select>
                  </div>

                  {/* Category Dropdown */}
                  {productSource === "category" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 block">
                        Select Category
                      </label>
                      <select
                        value={productCategory}
                        onChange={(e) => {
                          const catSlug = e.target.value;
                          setProductCategory(catSlug);
                          setProductSeeAll(`/products?category=${catSlug}`);
                        }}
                        className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <option value="">-- Choose Category --</option>
                        {availableCategories.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.name} ({c.slug})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Brand Dropdown */}
                  {productSource === "brand" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 block">
                        Select Brand
                      </label>
                      <select
                        value={productBrand}
                        onChange={(e) => {
                          const bSlug = e.target.value;
                          setProductBrand(bSlug);
                          setProductSeeAll(`/brands/${bSlug}`);
                        }}
                        className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <option value="">-- Choose Brand --</option>
                        {availableBrands.map((b) => (
                          <option key={b.id} value={b.slug}>
                            {b.name} ({b.slug})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Display Layout & Rows / Count Limit */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 block">
                        Display Layout
                      </label>
                      <select
                        value={productLayout}
                        onChange={(e) => setProductLayout(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <option value="featured-grid">
                          Grid Layout (featured-grid)
                        </option>
                        <option value="carousel">
                          Horizontal Slider (carousel)
                        </option>
                      </select>
                    </div>

                    {productLayout === "featured-grid" ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Number of Grid Rows
                        </label>
                        <select
                          value={productRows}
                          onChange={(e) => {
                            const r = Number(e.target.value) || 1;
                            setProductRows(r);
                            setProductLimit(r * 5);
                          }}
                          className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <option value={1}>1 Row (5 Products)</option>
                          <option value={2}>2 Rows (10 Products)</option>
                          <option value={3}>3 Rows (15 Products)</option>
                          <option value={4}>4 Rows (20 Products)</option>
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Item Count Limit
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={productLimit}
                          onChange={(e) =>
                            setProductLimit(Number(e.target.value) || 8)
                          }
                        />
                      </div>
                    )}
                  </div>

                  {/* Description Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 block">
                      Section Description
                    </label>
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="e.g. Discover premium hardware with guaranteed performance, curated details, and exclusive checkout options."
                      className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 h-20 resize-none"
                    />
                  </div>

                  {/* Title Accent Color Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 block">
                      Title Accent Color (Second Word)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={productTitleColor}
                        onChange={(e) => setProductTitleColor(e.target.value)}
                        className="flex-1 text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <option value="">🔮 Automatic (Theme Default)</option>
                        <option value="#3b82f6">🔵 Blue (#3b82f6)</option>
                        <option value="#a855f7">🟣 Purple (#a855f7)</option>
                        <option value="#f43f5e">🔴 Rose (#f43f5e)</option>
                        <option value="#10b981">🟢 Emerald (#10b981)</option>
                        <option value="#f59e0b">🟡 Amber (#f59e0b)</option>
                        <option value="#06b6d4">🔵 Cyan (#06b6d4)</option>
                        <option value="custom">🎨 Custom Hex Color...</option>
                      </select>
                      {(productTitleColor === "custom" || (productTitleColor.startsWith("#") && !["#3b82f6", "#a855f7", "#f43f5e", "#10b981", "#f59e0b", "#06b6d4"].includes(productTitleColor))) && (
                        <Input
                          type="text"
                          placeholder="#FF5500"
                          value={productTitleColor === "custom" ? "" : productTitleColor}
                          onChange={(e) => setProductTitleColor(e.target.value)}
                          className="w-28 text-xs"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground block">
                      Customize the color of the second word in the section title.
                    </span>
                  </div>

                  {/* See All Button Destination Link Dropdown Select */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 block">
                      &quot;See All&quot; Destination Target
                    </label>
                    <select
                      value={productSeeAll}
                      onChange={(e) => setProductSeeAll(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="">⚡ Auto-generated Link (Default)</option>
                      <option value="/products">
                        🛍️ All Products Page (/products)
                      </option>
                      <option value="/products?sortBy=newest">
                        ✨ New Arrivals Page (/products?sortBy=newest)
                      </option>
                      <option value="/products?filter=on-sale">
                        🏷️ On Sale Products (/products?filter=on-sale)
                      </option>
                      <option value="/products?filter=low-stock">
                        ⏳ Limited Stock Deals (/products?filter=low-stock)
                      </option>
                      <option value="/deals">
                        🔥 Special Deals Page (/deals)
                      </option>
                      <optgroup label="Categories">
                        {availableCategories.map((c) => (
                          <option
                            key={c.id}
                            value={`/products?category=${c.slug}`}
                          >
                            📁 {c.name} (/products?category={c.slug})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Brands">
                        {availableBrands.map((b) => (
                          <option key={b.id} value={`/brands/${b.slug}`}>
                            ⚡ {b.name} (/brands/{b.slug})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              ) : editingBlock?.type === "category-grid" ? (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-xs text-blue-400 font-medium">
                    Customize the 4 slots and overall background image for the Browse by Collection section!
                  </div>

                  {/* Section-Wide Background Image Input */}
                  <div className="space-y-1.5 bg-muted/40 p-3 rounded-lg border border-border">
                    <label className="text-xs font-semibold text-foreground block">
                      🖼️ Section Background Image URL (Whole Backdrop)
                    </label>
                    <Input
                      type="text"
                      placeholder="https://images.unsplash.com/photo-... (Paste custom background URL)"
                      value={categoryGridBgImage}
                      onChange={(e) => setCategoryGridBgImage(e.target.value)}
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Optional: Set a custom high-resolution background image for the entire Browse by Collection section.
                    </span>
                  </div>

                  {/* Slot Tabs */}
                  <div className="flex border-b border-border gap-1 overflow-x-auto pb-1">
                    {[
                      { name: "Slot 1 (Hero)", idx: 0 },
                      { name: "Slot 2 (Left)", idx: 1 },
                      { name: "Slot 3 (Right)", idx: 2 },
                      { name: "Slot 4 (Spotlight)", idx: 3 },
                    ].map((tab) => (
                      <button
                        key={tab.idx}
                        type="button"
                        onClick={() => setActiveSlotIdx(tab.idx)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors whitespace-nowrap cursor-pointer ${
                          activeSlotIdx === tab.idx
                            ? "bg-blue-600 text-white"
                            : "text-muted-foreground hover:text-foreground bg-muted/40"
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>

                  {/* Form for Active Slot */}
                  {bentoSlots[activeSlotIdx] && (
                    <div className="space-y-3 pt-1">
                      {/* Category Dropdown */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Category Destination
                        </label>
                        <select
                          value={bentoSlots[activeSlotIdx].slug}
                          onChange={(e) => {
                            const selectedSlug = e.target.value;
                            setBentoSlots((prev) =>
                              prev.map((s, i) =>
                                i === activeSlotIdx ? { ...s, slug: selectedSlug } : s,
                              ),
                            );
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-input bg-background text-foreground"
                        >
                          {availableCategories.map((c) => (
                            <option key={c.id} value={c.slug}>
                              📁 {c.name} ({c.slug})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Media Format Toggle: Image vs Video */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Media Format
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setBentoSlots((prev) =>
                                prev.map((s, i) =>
                                  i === activeSlotIdx ? { ...s, mediaType: "image" } : s,
                                ),
                              )
                            }
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${
                              bentoSlots[activeSlotIdx].mediaType === "image"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-input text-muted-foreground bg-background hover:bg-muted"
                            }`}
                          >
                            📷 Static Image
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setBentoSlots((prev) =>
                                prev.map((s, i) =>
                                  i === activeSlotIdx ? { ...s, mediaType: "video" } : s,
                                ),
                              )
                            }
                            className={`p-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${
                              bentoSlots[activeSlotIdx].mediaType === "video"
                                ? "bg-purple-600 text-white border-purple-600"
                                : "border-input text-muted-foreground bg-background hover:bg-muted"
                            }`}
                          >
                            🎥 Looping Video (.mp4)
                          </button>
                        </div>
                      </div>

                      {/* Media URL Input */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          {bentoSlots[activeSlotIdx].mediaType === "video"
                            ? "Video Loop MP4 Direct URL"
                            : "Image URL (Unsplash or PocketBase)"}
                        </label>
                        <Input
                          type="text"
                          placeholder={
                            bentoSlots[activeSlotIdx].mediaType === "video"
                              ? "https://example.com/ambient-loop.mp4"
                              : "https://images.unsplash.com/photo-..."
                          }
                          value={bentoSlots[activeSlotIdx].mediaUrl}
                          onChange={(e) => {
                            const url = e.target.value;
                            setBentoSlots((prev) =>
                              prev.map((s, i) =>
                                i === activeSlotIdx ? { ...s, mediaUrl: url } : s,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Custom Title Override */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Custom Title (Optional)
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g. Next-Gen Gaming Laptops"
                          value={bentoSlots[activeSlotIdx].title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBentoSlots((prev) =>
                              prev.map((s, i) =>
                                i === activeSlotIdx ? { ...s, title: val } : s,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Custom Subtitle / Description */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Tagline / Subtitle (Optional)
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g. Ultra-fast performance workstations"
                          value={bentoSlots[activeSlotIdx].description}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBentoSlots((prev) =>
                              prev.map((s, i) =>
                                i === activeSlotIdx ? { ...s, description: val } : s,
                              ),
                            );
                          }}
                        />
                      </div>

                      {/* Custom Badge Label */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Badge Label (Optional)
                        </label>
                        <Input
                          type="text"
                          placeholder="e.g. LAPTOPS, HOT DEAL"
                          value={bentoSlots[activeSlotIdx].label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBentoSlots((prev) =>
                              prev.map((s, i) =>
                                i === activeSlotIdx ? { ...s, label: val } : s,
                              ),
                            );
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : editingBlock?.type === "brand-logo-strip" ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border">
                    Enable or disable the brands that appear in the homepage marquee loop:
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1 pb-1">
                    {availableBrands.map((brand) => (
                      <label
                        key={brand.id}
                        className="flex items-center gap-3 p-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl cursor-pointer transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={brand.show_in_strip || false}
                          onChange={(e) => handleConfigModalToggleBrandStrip(brand, e.target.checked)}
                          className="rounded border-border accent-blue-600 cursor-pointer h-4 w-4"
                        />
                        {brand.logoUrl ? (
                          <div className="h-8 w-12 rounded bg-slate-850 flex items-center justify-center p-1 border border-border shrink-0">
                            <img src={brand.logoUrl} alt={brand.name} className="h-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-8 w-12 rounded bg-muted flex items-center justify-center border border-border shrink-0 text-[10px] font-black uppercase text-muted-foreground">
                            Logo
                          </div>
                        )}
                        <span className="text-xs font-bold text-foreground truncate">{brand.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border">
                    This block type ({editingBlock?.type}) works out-of-the-box
                    with active system settings.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="text-muted-foreground border border-border"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hero Banner Editor Modal */}
      {isHeroModalOpen && heroSlides[0] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-4xl w-full my-auto animate-scale-in">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingSlideIndex !== null
                    ? `Edit Hero Banner (Banner ${editingSlideIndex + 1})`
                    : "Add New Hero Banner"}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {editingSlideIndex !== null
                    ? "Update fields for this banner slide."
                    : "Fill in details to add a new banner slide to the homepage hero."}
                </p>
              </div>
              <button
                onClick={() => setIsHeroModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveHeroConfig}
              className="p-5 space-y-5 max-h-[75vh] overflow-y-auto"
            >
              {(() => {
                const slide = heroSlides[0];
                const index = 0;
                return (
                  <div className="rounded-xl border border-border bg-background/60 p-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Banner Label (Eyebrow)
                        </label>
                        <Input
                          value={slide.eyebrow}
                          onChange={(e) =>
                            updateHeroSlide(index, "eyebrow", e.target.value)
                          }
                          placeholder="e.g. Featured Collection"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground/80 block">
                            Accent / Font Color
                          </label>
                          {(slide.imageFile || slide.imageUrl) && (
                            <button
                              type="button"
                              onClick={() => void handleAutoExtractColor(index)}
                              className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 px-2 py-0.5 rounded transition-colors"
                            >
                              🎨 Auto-detect from Image
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={slide.accentColor || "#111827"}
                            onChange={(e) =>
                              updateHeroSlide(
                                index,
                                "accentColor",
                                e.target.value,
                              )
                            }
                            className="w-9 h-9 p-0.5 rounded border border-input bg-background cursor-pointer shrink-0"
                            title="Pick color"
                          />
                          <Input
                            value={slide.accentColor || ""}
                            onChange={(e) =>
                              updateHeroSlide(
                                index,
                                "accentColor",
                                e.target.value,
                              )
                            }
                            placeholder="#111827"
                            className="font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Title Prefix
                        </label>
                        <Input
                          value={slide.titlePrefix}
                          onChange={(e) =>
                            updateHeroSlide(
                              index,
                              "titlePrefix",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. New Arrivals"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Title Highlight
                        </label>
                        <Input
                          value={slide.titleHighlight}
                          onChange={(e) =>
                            updateHeroSlide(
                              index,
                              "titleHighlight",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. Summer Collection"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 block">
                        Sub-title / Description
                      </label>
                      <textarea
                        value={slide.description}
                        onChange={(e) =>
                          updateHeroSlide(index, "description", e.target.value)
                        }
                        rows={3}
                        className="w-full font-sans text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        placeholder="Brief description for this slide..."
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Primary CTA Text
                        </label>
                        <Input
                          value={slide.ctaText}
                          onChange={(e) =>
                            updateHeroSlide(index, "ctaText", e.target.value)
                          }
                          placeholder="e.g. Shop Now"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Primary Link
                        </label>
                        <Input
                          value={slide.link}
                          onChange={(e) =>
                            updateHeroSlide(index, "link", e.target.value)
                          }
                          placeholder="/products"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Secondary CTA Text
                        </label>
                        <Input
                          value={slide.ctaSecondary || ""}
                          onChange={(e) =>
                            updateHeroSlide(
                              index,
                              "ctaSecondary",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. Learn More"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 block">
                          Secondary Link
                        </label>
                        <Input
                          value={slide.secondaryLink || ""}
                          onChange={(e) =>
                            updateHeroSlide(
                              index,
                              "secondaryLink",
                              e.target.value,
                            )
                          }
                          placeholder="/brands"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 block">
                        Banner Image
                      </label>
                      <div className="rounded-lg border border-dashed border-input bg-background/60 p-3 space-y-2">
                        {/* Preview */}
                        {(slide.imageUrl || slide.imageFile) && (
                          <div className="relative w-full aspect-[16/7] overflow-hidden rounded-md bg-muted">
                            <img
                              src={
                                slide.imageFile
                                  ? URL.createObjectURL(slide.imageFile)
                                  : slide.imageUrl
                              }
                              alt="Banner preview"
                              className="w-full h-full object-contain p-2"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`image-upload-${index}`}
                            className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-500/10 border border-blue-500/30 rounded-md px-3 py-2 transition-colors"
                          >
                            📁{" "}
                            {slide.imageFile || slide.imageUrl
                              ? "Change Image"
                              : "Upload Image"}
                          </label>
                          <input
                            id={`image-upload-${index}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleImageUploadAndAutoColor(index, file);
                              }
                            }}
                          />
                          {(slide.imageFile || slide.imageUrl) && (
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-600 font-medium"
                              onClick={() => {
                                updateHeroSlide(index, "imageFile", undefined);
                                updateHeroSlide(index, "imageUrl", undefined);
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          JPG, PNG, WebP or GIF · max 10 MB
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsHeroModalOpen(false)}
                  className="text-muted-foreground border border-border"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />{" "}
                      {editingSlideIndex !== null
                        ? "Save Changes"
                        : "Create Banner"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
