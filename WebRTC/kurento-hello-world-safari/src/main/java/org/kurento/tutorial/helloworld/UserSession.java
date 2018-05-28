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

import org.kurento.client.MediaPipeline;
import org.kurento.client.WebRtcEndpoint;

// Safari user reports
import java.io.PrintWriter;

public class UserSession
{
  private MediaPipeline mediaPipeline;
  private WebRtcEndpoint webRtcEndpoint;

  public UserSession()
  {}

  public MediaPipeline getMediaPipeline()
  { return mediaPipeline; }

  public void setMediaPipeline(MediaPipeline mediaPipeline)
  { this.mediaPipeline = mediaPipeline; }

  public WebRtcEndpoint getWebRtcEndpoint()
  { return webRtcEndpoint; }

  public void setWebRtcEndpoint(WebRtcEndpoint webRtcEndpoint)
  { this.webRtcEndpoint = webRtcEndpoint; }

  // Safari user reports

  private PrintWriter reportWriter;
  private long iceTimeMs;
  private long mediaTimeMs;

  public void setReportWriter(PrintWriter value)
  { this.reportWriter = value; }

  public PrintWriter getReportWriter()
  { return reportWriter; }

  public void setIceTimeMs(long value)
  { this.iceTimeMs = value; }

  public long getIceTimeMs()
  { return iceTimeMs; }

  public void setMediaTimeMs(long value)
  { this.mediaTimeMs = value; }

  public long getMediaTimeMs()
  { return mediaTimeMs; }
}
