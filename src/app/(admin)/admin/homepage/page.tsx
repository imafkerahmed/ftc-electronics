"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
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
import { pbHomepageBlocks, pbHeroBanners } from "@/lib/pb-collections";
import {
  updateHomepageBlocksAction,
  updateHomepageBlockConfigAction,
  createHomepageBlockAction,
  deleteHomepageBlockAction,
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
      typeof fileOrUrl === "string" ? fileOrUrl : URL.createObjectURL(fileOrUrl);

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
      await Promise.all(
        reordered.map((item, idx) => {
          if (!item.id) return Promise.resolve();
          return pbHeroBanners.update(item.id, { sortOrder: idx });
        }),
      );
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await pbHomepageBlocks.getAll();
      const heroRecords = await pbHeroBanners.getAll().catch(() => []);

      setBlocks(
        (res || []).map(
          (b: any) => ({
            id: b.id,
            type: b.type || b.block_type || "section",
            title: b.title || "Page Section",
            isEnabled: b.isEnabled !== false && b.is_active !== false,
            sortOrder: b.sortOrder || 0,
            config: b.config || {},
          }),
        ),
      );

      const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://ftc-db.codix.site/";
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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const reordered = [...blocks];
    const [movedItem] = reordered.splice(draggedIdx, 1);
    reordered.splice(index, 0, movedItem);

    setBlocks(reordered);
    setDraggedIdx(null);
  };

  const handleOpenConfig = (block: HomepageBlock) => {
    if (block.type === "hero-banner") {
      handleOpenHeroEditor(block);
      return;
    }
    setEditingBlock(block);
    setConfigText(JSON.stringify(block.config || {}, null, 2));
    setError(null);
    setSuccess(null);
    setIsConfigModalOpen(true);
  };  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(
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
        await pbHeroBanners.delete(slideToDelete.id).catch(() => {});
        setSuccess(`Banner slide deleted.`);
        loadData();
      }
    });
  };

  const handleReorderBannerSlide = async (
    index: number,
    direction: -1 | 1,
  ) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= heroBannerList.length) return;

    const list = [...heroBannerList];
    const [moved] = list.splice(index, 1);
    list.splice(nextIdx, 0, moved);

    setHeroBannerList(list);

    startTransition(async () => {
      await Promise.all(
        list.map((item, idx) => {
          if (!item.id) return Promise.resolve();
          return pbHeroBanners.update(item.id, { sortOrder: idx });
        }),
      );
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
        await pbHeroBanners.update(targetId, fd);
        setSuccess(
          `Banner slide ${editingSlideIndex + 1} updated successfully.`,
        );
      } else {
        fd.append("sortOrder", String(heroBannerList.length));
        await pbHeroBanners.create(fd);
        setSuccess("New hero banner slide created successfully.");
      }

      setIsHeroModalOpen(false);
      loadData();
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(configText || "{}");
    } catch {
      setError("Specifications must be a valid JSON object.");
      return;
    }

    if (!editingBlock) return;

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
                {heroBannerList.length} slide{heroBannerList.length === 1 ? "" : "s"}
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
                          onClick={() => void handleReorderBannerSlide(index, -1)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === heroBannerList.length - 1 || isPending}
                          onClick={() => void handleReorderBannerSlide(index, 1)}
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
                    No hero banners added yet. Click &quot;+ Add Hero Banner&quot; to create your first banner slide.
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
              No additional layout blocks. Click &quot;Add Block&quot; to add section blocks like product carousels or promo banners.
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
                        className="flex items-center gap-3 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                          title={block.isEnabled ? "Disable Block" : "Enable Block"}
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
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <div className="w-full">
                            <span className="font-semibold text-foreground block mb-1">
                              Block Specification Configuration:
                            </span>
                            <pre className="font-mono text-[11px] p-2.5 rounded-lg bg-background border border-border text-muted-foreground overflow-x-auto max-h-40">
                              {JSON.stringify(block.config || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenConfig(block)}
                            className="text-xs h-8 border-border"
                          >
                            <Settings className="h-3.5 w-3.5 mr-1" /> Edit Specification JSON
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

              {newBlockType !== "hero-banner" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">
                    Configuration JSON
                  </label>
                  <textarea
                    value={newBlockConfig}
                    onChange={(e) => setNewBlockConfig(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs p-2.5 rounded-lg border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    placeholder='{\n  "source": "on-sale",\n  "limit": 6\n}'
                  />
                </div>
              )}

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
            <form onSubmit={handleSaveConfig} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">
                  Configuration JSON
                </label>
                <textarea
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  rows={8}
                  required
                  className="w-full font-mono text-xs p-2.5 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  placeholder='{\n  "headline": "Welcome",\n  "subtitle": "Discover more"\n}'
                />
              </div>

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
