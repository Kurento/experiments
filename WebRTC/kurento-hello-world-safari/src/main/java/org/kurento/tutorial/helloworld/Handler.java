/*
 * Copyright 2018 Kurento (https://www.kurento.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.kurento.tutorial.helloworld;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

// Kurento client
import org.kurento.client.BaseRtpEndpoint;
import org.kurento.client.EventListener;
import org.kurento.client.IceCandidate;
import org.kurento.client.KurentoClient;
import org.kurento.client.MediaPipeline;
import org.kurento.client.WebRtcEndpoint;
import org.kurento.jsonrpc.JsonUtils;

// Kurento events
import org.kurento.client.ConnectionStateChangedEvent;
import org.kurento.client.ErrorEvent;
import org.kurento.client.IceCandidateFoundEvent;
import org.kurento.client.IceComponentStateChangeEvent;
import org.kurento.client.IceGatheringDoneEvent;
import org.kurento.client.MediaFlowInStateChangeEvent;
import org.kurento.client.MediaFlowOutStateChangeEvent;
import org.kurento.client.MediaStateChangedEvent;
import org.kurento.client.MediaTranscodingStateChangeEvent;
import org.kurento.client.NewCandidatePairSelectedEvent;

// Safari User Reports
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;
import org.kurento.client.MediaType;
import org.kurento.client.IceComponentState;


/**
 * Kurento Java Tutorial - Handler class.
 */
public class Handler extends TextWebSocketHandler
{
  private final Logger log = LoggerFactory.getLogger(Handler.class);
  private final Gson gson = new GsonBuilder().create();

  private final ConcurrentHashMap<String, UserSession> users =
      new ConcurrentHashMap<>();

  @Autowired
  private KurentoClient kurento;

  /**
	 * Invoked after WebSocket negotiation has succeeded and the WebSocket connection is
	 * opened and ready for use.
	 */
	@Override
  public void afterConnectionEstablished(WebSocketSession session)
      throws Exception
  {
    log.info("[Handler::afterConnectionEstablished] New WebSocket connection, sessionId: {}",
        session.getId());
	}

  /**
	 * Invoked after the WebSocket connection has been closed by either side, or after a
	 * transport error has occurred. Although the session may technically still be open,
	 * depending on the underlying implementation, sending messages at this point is
	 * discouraged and most likely will not succeed.
	 */
	@Override
  public void afterConnectionClosed(WebSocketSession session,
      CloseStatus status) throws Exception
  {
    if (!status.equalsCode(CloseStatus.NORMAL)) {
      log.warn("[Handler::afterConnectionClosed] status: {}, sessionId: {}",
          status, session.getId());
    }

    stop(session);
  }

  /**
	 * Invoked when a new WebSocket message arrives.
	 */
	@Override
  protected void handleTextMessage(WebSocketSession session,
      TextMessage message) throws Exception
  {
    final String sessionId = session.getId();
    JsonObject jsonMessage = gson.fromJson(message.getPayload(),
        JsonObject.class);

    log.debug("[Handler::handleTextMessage] {}, sessionId: {}",
        jsonMessage, sessionId);

    try {
      final String messageId = jsonMessage.get("id").getAsString();
      switch (messageId) {
        case "PROCESS_SDP_OFFER":
          // Start: Create user session and process SDP Offer
          handleProcessSdpOffer(session, jsonMessage);
          break;
        case "ADD_ICE_CANDIDATE":
          handleAddIceCandidate(session, jsonMessage);
          break;
        case "STOP":
          handleStop(session, jsonMessage);
          break;
        case "ERROR":
          handleError(session, jsonMessage);
          break;

        // Safari User Reports
        case "REPORT_START":
          // User clicked the "Start" button
          handleReportStart(session, jsonMessage);
          break;
        case "REPORT_BROWSER_INFO":
          // Browser and hardware information
          handleReportBrowserInfo(session, jsonMessage);
          break;
        case "REPORT_LOCAL_PLAYING":
          // Local video track started playing
          handleReportLocalPlaying(session, jsonMessage);
          break;
        case "REPORT_REMOTE_PLAYING":
          // Remote video track started playing
          handleReportRemotePlaying(session, jsonMessage);
          break;

        default:
          // Ignore the message
          log.warn("[Handler::handleTextMessage] Skip, invalid message, id: {}",
              messageId);
          break;
      }
    } catch (Throwable ex) {
      log.error("[Handler::handleTextMessage] Exception: {}, sessionId: {}",
          ex, sessionId);
      sendError(session, "[Kurento] Exception: " + ex.getMessage());
    }
  }

  /**
	 * Handle an error from the underlying WebSocket message transport.
	 */
	@Override
  public void handleTransportError(WebSocketSession session,
      Throwable exception) throws Exception
  {
    log.error("[Handler::handleTransportError] Exception: {}, sessionId: {}",
        exception, session.getId());

    session.close(CloseStatus.SERVER_ERROR);
  }

  private synchronized void sendMessage(final WebSocketSession session,
      String message)
  {
    log.debug("[Handler::sendMessage] {}", message);

    if (!session.isOpen()) {
      log.warn("[Handler::sendMessage] Skip, WebSocket session isn't open");
      return;
    }

    final String sessionId = session.getId();
    if (!users.containsKey(sessionId)) {
      log.warn("[Handler::sendMessage] Skip, unknown user, id: {}",
          sessionId);
      return;
    }

    try {
      session.sendMessage(new TextMessage(message));
    } catch (IOException ex) {
      log.error("[Handler::sendMessage] Exception: {}", ex.getMessage());
    }
  }

  private void sendError(final WebSocketSession session, String errMsg)
  {
    log.error(errMsg);

    if (users.containsKey(session.getId())) {
      JsonObject message = new JsonObject();
      message.addProperty("id", "ERROR");
      message.addProperty("message", errMsg);
      sendMessage(session, message.toString());
    }
  }

  // PROCESS_SDP_OFFER ---------------------------------------------------------

  private void initBaseEventListeners(final WebSocketSession session,
      BaseRtpEndpoint baseRtpEp, final String className)
  {
    log.info("[Handler::initBaseEventListeners] name: {}, class: {}, sessionId: {}",
        baseRtpEp.getName(), className, session.getId());

    // Event: Some error happened
    baseRtpEp.addErrorListener(new EventListener<ErrorEvent>() {
      @Override
      public void onEvent(ErrorEvent ev) {
        log.error("[{}::{}] source: {}, timestamp: {}, tags: {}, description: {}, errorCode: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getDescription(), ev.getErrorCode());

        sendError(session, "[Kurento] " + ev.getDescription());
        stop(session);
      }
    });

    // Event: Media is flowing into this sink
    baseRtpEp.addMediaFlowInStateChangeListener(
        new EventListener<MediaFlowInStateChangeEvent>() {
      @Override
      public void onEvent(MediaFlowInStateChangeEvent ev) {
        log.info("[{}::{}] source: {}, timestamp: {}, tags: {}, state: {}, padName: {}, mediaType: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getState(), ev.getPadName(), ev.getMediaType());

        // Safari User Reports
        if (ev.getMediaType() == MediaType.VIDEO) {
          reportMediaFlow(session);

          JsonObject message = new JsonObject();
          message.addProperty("id", "STATUS");
          message.addProperty("status", "STATUS_MEDIA_FLOWING");
          sendMessage(session, message.toString());
        }

      }
    });

    // Event: Media is flowing out of this source
    baseRtpEp.addMediaFlowOutStateChangeListener(
        new EventListener<MediaFlowOutStateChangeEvent>() {
      @Override
      public void onEvent(MediaFlowOutStateChangeEvent ev) {
        log.info("[{}::{}] source: {}, timestamp: {}, tags: {}, state: {}, padName: {}, mediaType: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getState(), ev.getPadName(), ev.getMediaType());
      }
    });

    // Event: [TODO write meaning of this event]
    baseRtpEp.addConnectionStateChangedListener(
        new EventListener<ConnectionStateChangedEvent>() {
      @Override
      public void onEvent(ConnectionStateChangedEvent ev) {
        log.info("[{}::{}] source: {}, timestamp: {}, tags: {}, oldState: {}, newState: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getOldState(), ev.getNewState());
      }
    });

    // Event: [TODO write meaning of this event]
    baseRtpEp.addMediaStateChangedListener(
        new EventListener<MediaStateChangedEvent>() {
      @Override
      public void onEvent(MediaStateChangedEvent ev) {
        log.info("[{}::{}] source: {}, timestamp: {}, tags: {}, oldState: {}, newState: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getOldState(), ev.getNewState());
      }
    });

    // Event: This element will (or will not) perform media transcoding
    baseRtpEp.addMediaTranscodingStateChangeListener(
        new EventListener<MediaTranscodingStateChangeEvent>() {
      @Override
      public void onEvent(MediaTranscodingStateChangeEvent ev) {
        log.info("[{}::{}] source: {}, timestamp: {}, tags: {}, state: {}, binName: {}, mediaType: {}",
            className, ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getState(), ev.getBinName(), ev.getMediaType());
      }
    });
  }

  private void initWebRtcEventListeners(final WebSocketSession session,
      final WebRtcEndpoint webRtcEp)
  {
    log.info("[Handler::initWebRtcEventListeners] name: {}, sessionId: {}",
        webRtcEp.getName(), session.getId());

    // Event: The ICE backend found a local candidate during Trickle ICE
    webRtcEp.addIceCandidateFoundListener(
        new EventListener<IceCandidateFoundEvent>() {
      @Override
      public void onEvent(IceCandidateFoundEvent ev) {
        log.debug("[WebRtcEndpoint::{}] source: {}, timestamp: {}, tags: {}, candidate: {}",
            ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), JsonUtils.toJson(ev.getCandidate()));

        // Safari User Reports
        reportIceCandidate(session, JsonUtils.toJson(ev.getCandidate()), "Kms");

        JsonObject message = new JsonObject();
        message.addProperty("id", "ADD_ICE_CANDIDATE");
        message.add("candidate", JsonUtils.toJsonObject(ev.getCandidate()));
        sendMessage(session, message.toString());
      }
    });

    // Event: The ICE backend changed state
    webRtcEp.addIceComponentStateChangeListener(
        new EventListener<IceComponentStateChangeEvent>() {
      @Override
      public void onEvent(IceComponentStateChangeEvent ev) {
        log.debug("[WebRtcEndpoint::{}] source: {}, timestamp: {}, tags: {}, streamId: {}, componentId: {}, state: {}",
            ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getStreamId(), ev.getComponentId(), ev.getState());

        // Safari User Reports
        if (ev.getState() == IceComponentState.GATHERING) {
          reportIceStart(session);
        }
        else if (ev.getState() == IceComponentState.CONNECTING) {
          JsonObject message = new JsonObject();
          message.addProperty("id", "STATUS");
          message.addProperty("status", "STATUS_ICE_CONNECTING");
          sendMessage(session, message.toString());
        }
      }
    });

    // Event: The ICE backend finished gathering ICE candidates
    webRtcEp.addIceGatheringDoneListener(
        new EventListener<IceGatheringDoneEvent>() {
      @Override
      public void onEvent(IceGatheringDoneEvent ev) {
        log.info("[WebRtcEndpoint::{}] source: {}, timestamp: {}, tags: {}",
            ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags());

        // Safari User Reports
        reportIceDone(session);
      }
    });

    // Event: The ICE backend selected a new pair of ICE candidates for use
    webRtcEp.addNewCandidatePairSelectedListener(
        new EventListener<NewCandidatePairSelectedEvent>() {
      @Override
      public void onEvent(NewCandidatePairSelectedEvent ev) {
        log.info("[WebRtcEndpoint::{}] name: {}, timestamp: {}, tags: {}, streamId: {}, local: {}, remote: {}",
            ev.getType(), ev.getSource().getName(), ev.getTimestamp(),
            ev.getTags(), ev.getCandidatePair().getStreamID(),
            ev.getCandidatePair().getLocalCandidate(),
            ev.getCandidatePair().getRemoteCandidate());
      }
    });
  }

  private void initWebRtcEndpoint(final WebSocketSession session,
      final WebRtcEndpoint webRtcEp, String sdpOffer)
  {
    initBaseEventListeners(session, webRtcEp, "WebRtcEndpoint");
    initWebRtcEventListeners(session, webRtcEp);

    final String sessionId = session.getId();
    final String name = "user" + sessionId + "_webrtcendpoint";
    webRtcEp.setName(name);

    /*
    OPTIONAL: Force usage of an Application-specific STUN server.
    Usually this is configured globally in KMS WebRTC settings file:
    /etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini

    But it can also be configured per-application, as shown:

    log.info("[Handler::initWebRtcEndpoint] Using STUN server: 193.147.51.12:3478");
    webRtcEp.setStunServerAddress("193.147.51.12");
    webRtcEp.setStunServerPort(3478);
    */

    // Continue the SDP Negotiation: Generate an SDP Answer
    final String sdpAnswer = webRtcEp.processOffer(sdpOffer);

    log.info("[Handler::initWebRtcEndpoint] name: {}, SDP Offer from browser to KMS:\n{}",
        name, sdpOffer);
    log.info("[Handler::initWebRtcEndpoint] name: {}, SDP Answer from KMS to browser:\n{}",
        name, sdpAnswer);

    JsonObject message = new JsonObject();
    message.addProperty("id", "PROCESS_SDP_ANSWER");
    message.addProperty("sdpAnswer", sdpAnswer);
    sendMessage(session, message.toString());


    // ---- Safari User Reports

    reportSdpOfferAnswer(session, sdpOffer, sdpAnswer);
  }

  private void startWebRtcEndpoint(WebRtcEndpoint webRtcEp)
  {
    // Calling gatherCandidates() is when the Endpoint actually starts working.
    // In this tutorial, this is emphasized for demonstration purposes by
    // launching the ICE candidate gathering in its own method.
    webRtcEp.gatherCandidates();
  }

  private void handleProcessSdpOffer(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    // ---- Session handling

    final String sessionId = session.getId();

    log.info("[Handler::handleStart] User count: {}", users.size());
    log.info("[Handler::handleStart] New user: {}", sessionId);

    final UserSession user = new UserSession();
    users.put(session.getId(), user);


    // ---- Safari User Reports

    String reportId = jsonMessage.get("reportId").getAsString();
    log.info("[Handler::handleStart] New User Report: {}", reportId);
    PrintWriter reportWriter;
    try {
      reportWriter = new PrintWriter("report_" + reportId + ".log");
    } catch (IOException ex) {
      log.error("[Handler::handleStart] Exception: {}",
          ex.getMessage());
      return;
    }
    user.setReportWriter(reportWriter);


    // ---- Media pipeline

    log.info("[Handler::handleStart] Create Media Pipeline");

    final MediaPipeline pipeline = kurento.createMediaPipeline();
    user.setMediaPipeline(pipeline);

    final WebRtcEndpoint webRtcEp =
        new WebRtcEndpoint.Builder(pipeline).build();
    user.setWebRtcEndpoint(webRtcEp);
    webRtcEp.connect(webRtcEp);


    // ---- Endpoint configuration

    String sdpOffer = jsonMessage.get("sdpOffer").getAsString();
    initWebRtcEndpoint(session, webRtcEp, sdpOffer);

    log.info("[Handler::handleStart] New WebRtcEndpoint: {}",
        webRtcEp.getName());


    // ---- Endpoint startup

    startWebRtcEndpoint(webRtcEp);


    // ---- Debug
    // final String pipelineDot = pipeline.getGstreamerDot();
    // try (PrintWriter out = new PrintWriter("pipeline.dot")) {
    //   out.println(pipelineDot);
    // } catch (IOException ex) {
    //   log.error("[Handler::start] Exception: {}", ex.getMessage());
    // }
  }

  // ADD_ICE_CANDIDATE ---------------------------------------------------------

  private void handleAddIceCandidate(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    final String sessionId = session.getId();
    if (!users.containsKey(sessionId)) {
      log.warn("[Handler::handleAddIceCandidate] Skip, unknown user, id: {}",
          sessionId);
      return;
    }

    final UserSession user = users.get(sessionId);
    final JsonObject jsonCandidate =
        jsonMessage.get("candidate").getAsJsonObject();
    final IceCandidate candidate =
        new IceCandidate(jsonCandidate.get("candidate").getAsString(),
        jsonCandidate.get("sdpMid").getAsString(),
        jsonCandidate.get("sdpMLineIndex").getAsInt());

    // Safari User Reports
    reportIceCandidate(session, JsonUtils.toJson(candidate), "Browser");

    WebRtcEndpoint webRtcEp = user.getWebRtcEndpoint();
    webRtcEp.addIceCandidate(candidate);
  }

  // STOP ----------------------------------------------------------------------

  private void stop(final WebSocketSession session)
  {
    // Remove the user session and release all resources
    final UserSession user = users.remove(session.getId());
    if (user != null) {
      MediaPipeline mediaPipeline = user.getMediaPipeline();
      if (mediaPipeline != null) {
        log.info("[Handler::stop] Release the Media Pipeline");
        mediaPipeline.release();
      }

      // Safari User Reports
      PrintWriter reportWriter = user.getReportWriter();
      if (reportWriter != null) {
        log.info("[Handler::stop] Close the Report writer");
        reportWriter.close();
      }
    }
  }

  private void handleStop(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    stop(session);
  }

  // ERROR ---------------------------------------------------------------------

  private void handleError(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    final String errMsg = jsonMessage.get("message").getAsString();
    log.error("Browser error: " + errMsg);

    log.info("Assume that the other side stops after an error...");
    stop(session);
  }

  // ---------------------------------------------------------------------------

  /* ============================= */
  /* ==== Safari User Reports ==== */
  /* ============================= */

  private String time2String(String format, long timeMs)
  {
    SimpleDateFormat sdf = new SimpleDateFormat(format);
    sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
    return sdf.format(new Date(timeMs));
  }

  // REPORT_START --------------------------------------------------------

  private void handleReportStart(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    log.info("[Handler::handleReportStart]");
  }

  // REPORT_BROWSER_INFO -------------------------------------------------------

  private void handleReportBrowserInfo(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    log.info("[Handler::handleReportBrowserInfo]");

    final UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    final String browserInfo = jsonMessage.get("browserInfo").getAsString();
    reportWriter.printf("\nBrowserInfo: %s\n", browserInfo);
    // log.info("[Handler::handleReportBrowserInfo] Write Report Browser Info: {}", browserInfo);

    reportWriter.flush();
  }

  // REPORT_LOCAL_PLAYING ------------------------------------------------------

  private void handleReportLocalPlaying(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    log.info("[Handler::handleReportLocalPlaying]");
  }

  // REPORT_REMOTE_PLAYING -----------------------------------------------------

  private void handleReportRemotePlaying(final WebSocketSession session,
      JsonObject jsonMessage)
  {
    log.info("[Handler::handleReportRemotePlaying]");

    final UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    final long timeMs = System.currentTimeMillis();
    final String timeStr = time2String("yyyy-MM-dd@HH:mm:ss", timeMs);
    reportWriter.printf("RemoteVideoPlaying: %s\n", timeStr);

    final long oldTimeMs = user.getMediaTimeMs();
    long diffTimeMs = timeMs - oldTimeMs;
    if (diffTimeMs < 0) {
      diffTimeMs = 0;
    }
    final String diffTimeStr = time2String("HH:mm:ss", diffTimeMs);
    reportWriter.printf("RemoteVideoDelay: %s\n", diffTimeStr);
    reportWriter.printf("RemoteVideoDelayMs: %d\n", diffTimeMs);

    reportWriter.flush();
  }

  // ----

  private void reportMediaFlow(final WebSocketSession session)
  {
    log.info("[Handler::reportMediaFlow]");

    UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    final long timeMs = System.currentTimeMillis();
    if (user.getMediaTimeMs() == 0) {
      // Only store the first time that the streams flows
      // (decoder errors can make it fluctuate)
      user.setMediaTimeMs(timeMs);
    }
    final String timeStr = time2String("yyyy-MM-dd@HH:mm:ss", timeMs);
    reportWriter.printf("RemoteMediaFlow: %s\n", timeStr);

    reportWriter.flush();
  }

  private void reportSdpOfferAnswer(final WebSocketSession session,
      String sdpOffer, String sdpAnswer)
  {
    log.info("[Handler::reportSdpOfferAnswer]");

    final UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    reportWriter.printf("SdpOffer: %s\n", sdpOffer);
    reportWriter.printf("SdpAnswer: %s\n", sdpAnswer);

    reportWriter.flush();
  }

  private void reportIceStart(final WebSocketSession session)
  {
    log.info("[Handler::reportIceStart]");

    UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    final long timeMs = System.currentTimeMillis();
    if (user.getIceTimeMs() == 0) {
      // Only store the first time that the ICE starts
      // (it is possible that the ICE Agent goes back to start again)
      user.setIceTimeMs(timeMs);
    }
    final String timeStr = time2String("yyyy-MM-dd@HH:mm:ss", timeMs);
    reportWriter.printf("IceStart: %s\n", timeStr);

    reportWriter.flush();
  }

  private void reportIceDone(final WebSocketSession session)
  {
    log.info("[Handler::reportIceDone]");

    final UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    final long timeMs = System.currentTimeMillis();
    final String timeStr = time2String("yyyy-MM-dd@HH:mm:ss", timeMs);
    reportWriter.printf("IceDone: %s\n", timeStr);

    long oldTimeMs = user.getIceTimeMs();
    if (oldTimeMs == 0) {
      // ICE Done happened BEFORE ICE Start!
      oldTimeMs = timeMs;
    }
    long diffTimeMs = timeMs - oldTimeMs;
    if (diffTimeMs < 0) {
      diffTimeMs = 0;
    }
    final String diffTimeStr = time2String("HH:mm:ss", diffTimeMs);
    reportWriter.printf("IceDoneTime: %s\n", diffTimeStr);
    reportWriter.printf("IceDoneTimeMs: %d\n", diffTimeMs);

    reportWriter.flush();
  }

  private void reportIceCandidate(final WebSocketSession session,
      String candidate, String type)
  {
    log.debug("[Handler::reportIceCandidate]");

    final UserSession user = users.get(session.getId());
    if (user == null) { return; }
    PrintWriter reportWriter = user.getReportWriter();
    if (reportWriter == null) { return; }

    reportWriter.printf(type + "Candidate: %s\n", candidate);

    reportWriter.flush();
  }
}
