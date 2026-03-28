import { VesselDataPoint } from "../types/tripData";
import { getColorBySpeed } from "./wind";

export function generateVesselPopupHTML(
  vesselId: string,
  data: VesselDataPoint,
  vesselColor: string,
  crewDescription?: string,
  highlighted?: boolean,
): string {
  const starStyle = `cursor:pointer; font-size:16px; margin-left:6px; user-select:none;`;
  const star = highlighted
    ? `<span class="highlight-toggle" data-vessel-id="${vesselId}" style="${starStyle}" title="Remove highlight">&#9733;</span>`
    : `<span class="highlight-toggle" data-vessel-id="${vesselId}" style="${starStyle} opacity:0.4;" title="Highlight crew">&#9734;</span>`;

  return `<div style="border-left: 4px solid ${vesselColor}; padding-left: 12px;">
          <strong>Vessel ID: ${vesselId}${star}</strong>
          <table class="vessel-data">
          ${
            crewDescription
              ? `<tr>
              <td>Crew:</td>
              <td>${crewDescription}</td>
            </tr>`
              : ""
          }
            <tr>
              <td>Speed:</td>
              <td>${data.sog?.toFixed(1) || "?"} knots</td>
            </tr>
            ${
              data.twa !== undefined && data.twa !== null
                ? `<tr>
              <td>Wind Direction:</td>
              <td>${data.twa !== null && data.twa !== undefined ? data.twa.toFixed(1) : "?"}°</td>
            </tr>`
                : ""
            }
            ${
              data.tws !== undefined && data.tws !== null
                ? `<tr>
              <td>Wind Speed:</td>
              <td>
                <span style="color: ${data.tws !== null && data.tws !== undefined ? getColorBySpeed(data.tws) : "#000000"}; font-weight: bold;">
                  ${data.tws !== null && data.tws !== undefined ? data.tws.toFixed(1) : "?"}
                </span> knots
              </td>
            </tr>
             <tr>
              <td>Heading:</td>
              <td>${data.hdg !== null && data.hdg !== undefined ? data.hdg.toFixed(1) : "?"} deg</td>
            </tr>`
                : ""
            }
          </table>
        </div>`;
}
