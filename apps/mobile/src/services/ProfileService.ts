/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "./NativeLocationService"
import { TrackingProfile, TripEvent } from "../types/global"

/**
 * Service for managing tracking profiles.
 * Thin wrapper over NativeLocationService profile methods.
 */
export const ProfileService = {
  getProfiles: (): Promise<TrackingProfile[]> => NativeLocationService.getProfiles(),

  createProfile: (profile: Omit<TrackingProfile, "id" | "createdAt">): Promise<number> =>
    NativeLocationService.createProfile(profile),

  updateProfile: (update: Partial<TrackingProfile> & { id: number }): Promise<boolean> =>
    NativeLocationService.updateProfile(update),

  deleteProfile: (id: number): Promise<boolean> => NativeLocationService.deleteProfile(id),

  recheckProfiles: (): Promise<void> => NativeLocationService.recheckProfiles(),

  getTripEvents: (startTimestamp: number, endTimestamp: number): Promise<TripEvent[]> =>
    NativeLocationService.getTripEvents(startTimestamp, endTimestamp)
}

export default ProfileService
