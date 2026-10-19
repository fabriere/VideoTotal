package expo.modules.noutubeview

import android.app.Activity
import android.graphics.Color
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * Reproductor nativo para la ventana flotante.
 *
 * Por que existe: el WebView de Android no dibuja su superficie de video dentro
 * de una ventana Picture-in-Picture (la ventana se abre en blanco y el video se
 * pausa). Ver docs/LECCIONES.md §11. La solucion es sacar el video del WebView:
 * la pagina entrega las URLs directas del stream que esta reproduciendo
 * (content/picture-in-picture.ts) y aqui se reproduce con ExoPlayer dentro del
 * decor view de la actividad, que si se dibuja en el PiP.
 *
 * El audio lo pone ExoPlayer mientras dura el PiP; la pagina pausa su propio
 * video al entrar para que no suenen dos. Al salir, onModeChanged devuelve la
 * posicion a la pagina para que continue donde iba.
 *
 * Main thread only.
 */
object NouPipPlayer {
  private const val TAG = "NouTubePiP"

  // YouTube entrega las URLs atadas al cliente que las pidio; sin un UA de
  // navegador el CDN responde 403 a algunas de ellas.
  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

  data class Stream(
    val videoUrl: String,
    /** Null cuando el formato ya trae audio y video juntos (progresivo). */
    val audioUrl: String?,
    val positionMs: Long,
    val width: Int,
    val height: Int,
  )

  private var stream: Stream? = null
  private var player: ExoPlayer? = null
  private var container: FrameLayout? = null
  private var playing = false

  /** Lo que reporta la pagina; se guarda para poder entrar al PiP sin preguntar. */
  fun setStream(value: Stream?) {
    stream = value
    // Si el PiP ya esta en marcha (el usuario paso al siguiente video sin salir
    // de la ventana), se cambia de fuente sin cerrar el reproductor.
    if (playing && value != null) {
      player?.let { applySource(it, value, value.positionMs) }
    }
  }

  /**
   * Solo la posicion. La pagina la manda cada pocos segundos para que el PiP
   * empiece donde va la reproduccion y no desde el principio; mientras el
   * reproductor nativo manda, su posicion es la buena y esto no lo mueve.
   */
  fun setPosition(positionMs: Long) {
    val value = stream ?: return
    stream = value.copy(positionMs = positionMs)
  }

  fun hasStream(): Boolean = stream != null

  fun isPlaying(): Boolean = playing

  fun positionMs(): Long = player?.currentPosition ?: stream?.positionMs ?: 0L

  /** Arranca el reproductor nativo por encima del WebView. Devuelve false si no hay stream. */
  fun start(activity: Activity): Boolean {
    val value = stream ?: return false
    if (playing) {
      player?.play()
      return true
    }
    val decor = activity.window?.decorView as? ViewGroup ?: return false

    val http = DefaultHttpDataSource.Factory()
      .setUserAgent(USER_AGENT)
      .setAllowCrossProtocolRedirects(true)

    val exo = ExoPlayer.Builder(activity)
      .setMediaSourceFactory(DefaultMediaSourceFactory(http))
      .build()

    val view = PlayerView(activity).apply {
      useController = false
      resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
      setBackgroundColor(Color.BLACK)
      player = exo
    }

    val root = FrameLayout(activity).apply {
      setBackgroundColor(Color.BLACK)
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER,
      )
      addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    exo.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        Log.w(TAG, "ExoPlayer error: ${error.errorCodeName} ${error.message}", error)
      }
    })

    applySource(exo, value, value.positionMs)
    exo.playWhenReady = true
    decor.addView(root)
    container = root
    player = exo
    playing = true
    Log.i(TAG, "native player started (${value.width}x${value.height}, audio=${value.audioUrl != null})")
    return true
  }

  private fun applySource(exo: ExoPlayer, value: Stream, positionMs: Long) {
    val http = DefaultHttpDataSource.Factory()
      .setUserAgent(USER_AGENT)
      .setAllowCrossProtocolRedirects(true)
    val video = ProgressiveMediaSource.Factory(http)
      .createMediaSource(MediaItem.fromUri(value.videoUrl))
    val source = if (value.audioUrl != null) {
      val audio = ProgressiveMediaSource.Factory(http)
        .createMediaSource(MediaItem.fromUri(value.audioUrl))
      // El PiP necesita las dos pistas: YouTube sirve el video "adaptativo" sin
      // audio, y sin esta mezcla la ventana se veria muda.
      MergingMediaSource(video, audio)
    } else {
      video
    }
    exo.setMediaSource(source)
    exo.prepare()
    exo.seekTo(positionMs.coerceAtLeast(0L))
  }

  /** Cierra el reproductor y devuelve la posicion para que la pagina continue ahi. */
  fun stop(): Long {
    val position = positionMs()
    try {
      container?.let { root ->
        root.removeAllViews()
        (root.parent as? ViewGroup)?.removeView(root)
      }
      player?.release()
    } catch (error: Exception) {
      Log.w(TAG, "unable to release the native player", error)
    }
    container = null
    player = null
    playing = false
    Log.i(TAG, "native player stopped at ${position}ms")
    return position
  }
}
