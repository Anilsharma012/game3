import mongoose, { Schema, Document } from "mongoose";

export interface ISettings extends Document {
  referralReferrerBonus: number; // amount credited to referrer (bonusBalance)
  referralNewUserBonus: number; // amount credited to new user (bonusBalance)
  supportReplyBrand: string; // name shown for admin replies
  updatedAt: Date;
}

const SettingsSchema: Schema = new Schema(
  {
    referralReferrerBonus: { type: Number, default: 100, min: 0 },
    referralNewUserBonus: { type: Number, default: 100, min: 0 },
    supportReplyBrand: { type: String, default: "TheMatka", trim: true },
  },
  { timestamps: true },
);

// Singleton pattern: only one document
SettingsSchema.statics.getSingleton = async function () {
  const Model = this as mongoose.Model<ISettings> & { getSingleton: () => Promise<ISettings> };
  let doc = await Model.findOne();
  if (!doc) {
    doc = await Model.create({});
  }
  return doc;
};

export interface ISettingsModel extends mongoose.Model<ISettings> {
  getSingleton(): Promise<ISettings>;
}

export default mongoose.model<ISettings, ISettingsModel>("Settings", SettingsSchema as any);
