from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc, or_
from datetime import datetime
from database import get_db
from models import Offer, BrandConfig, Customer, BotAlert, User
from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["brand"])


@router.get("/api/brand")
async def get_brand(db=Depends(get_db), _=Depends(get_current_user)):
    """Smart Link brand info and copyright."""
    # ponytail: BrandConfig at module level
    brand = await db.execute(select(BrandConfig).limit(1))
    brand = brand.scalar_one_or_none()
    if not brand:
        # Seed default
        brand = BrandConfig(
            brand_name="Smart Link",
            tagline="اللي يواكب التطور يسبق الجميع",
            copyright_text="© 2025 Smart Link. جميع الحقوق محفوظة. Smart Menu®",
            website="https://smart-menu-sigma.vercel.app",
            whatsapp="+218910089975",
            projects=["Smart Menu", "Smart Bot (قريباً)", "Smart POS (قريباً)"],
        )
        db.add(brand)
        await db.commit()
        await db.refresh(brand)
    return {
        "brand_name": brand.brand_name,
        "tagline": brand.tagline,
        "copyright": brand.copyright_text,
        "website": brand.website,
        "whatsapp": brand.whatsapp,
        "projects": brand.projects,
    }


@router.put("/api/brand")
async def update_brand(
    brand_name: str = Form(...), tagline: str = Form(""),
    copyright_text: str = Form(""), website: str = Form(""),
    whatsapp: str = Form(""), projects: str = Form(""),
    db=Depends(get_db), _=Depends(require_role("admin")),
):
    # ponytail: BrandConfig at module level
    brand = await db.execute(select(BrandConfig).limit(1))
    brand = brand.scalar_one_or_none()
    if not brand:
        brand = BrandConfig()
        db.add(brand)
    brand.brand_name = brand_name
    brand.tagline = tagline
    brand.copyright_text = copyright_text
    brand.website = website
    brand.whatsapp = whatsapp
    brand.projects = [p.strip() for p in projects.split(",") if p.strip()]
    await db.commit()
    return {"ok": True}
