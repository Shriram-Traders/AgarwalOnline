import mongoose, { Schema } from "mongoose";

const itemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    quantity: { type: Number, min: 1, max: 100, required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false },
);

/**
 * A named collection people share. A "board" gathers saved things to come back to
 * (Diwali gifts); a "basket" is a second basket to fill together and order (School list).
 */
const listSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: ["board", "basket"], default: "basket" },
    // joined through the invite link: they change items, the owner manages sharing
    collaborators: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // the owner's one switch: whether opening the link lets people join and edit, or only look and buy
    linkCanEdit: { type: Boolean, default: true },
    // one link to look, one to join; resetting both revokes every copy sent out
    shareToken: { type: String, required: true },
    inviteToken: { type: String, required: true },
    items: [itemSchema],
  },
  { timestamps: true, strict: "throw" },
);
listSchema.index({ ownerId: 1, updatedAt: -1 });
listSchema.index({ collaborators: 1, updatedAt: -1 });
listSchema.index({ shareToken: 1 }, { unique: true });
listSchema.index({ inviteToken: 1 }, { unique: true });
listSchema.index({ ownerId: 1, kind: 1 });

export const ShoppingList =
  mongoose.models.ShoppingList || mongoose.model("ShoppingList", listSchema);
