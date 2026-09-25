/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import androidx.core.content.ContextCompat

/** Native text is read through this: below Android 13 the in-app language reaches AppCompat activities only. */
object AppLanguage {
    @Volatile private var cached: Context? = null

    fun context(base: Context): Context {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return base
        return cached ?: ContextCompat.getContextForLanguage(base.applicationContext).also { cached = it }
    }

    // Built from the tag, because AppCompat writes the choice to its file on a background thread.
    fun use(base: Context, tag: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        val app = base.applicationContext
        cached = if (tag.isEmpty()) {
            app
        } else {
            app.createConfigurationContext(Configuration(app.resources.configuration).apply { setLocales(LocaleList.forLanguageTags(tag)) })
        }
    }
}
