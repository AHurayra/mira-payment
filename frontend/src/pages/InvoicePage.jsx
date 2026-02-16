import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import "./InvoicePage.css"
import QRCode from "react-qr-code";

function safeTxt(v, fallback = "-") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}
function moneyUSD(v) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPatientName(name) {
  if (!name) return "";

  const parts = String(name).split(",");

  const firstPart = parts[0]?.trim() || "";
  const secondPart = parts[1]?.trim() || "";

  const secondInitial = secondPart ? secondPart.charAt(0) : "";

  return secondInitial ? `${firstPart}, ${secondInitial}` : firstPart;
}


export default function InvoicePage() {
  const { payToken } = useParams();

  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet(`/api/invoice/${encodeURIComponent(payToken)}`);
      setInv(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payToken]);

  async function payNowStripe() {
    try {
      setPaying(true);
      const data = await apiPost(`/api/stripe/pay/${encodeURIComponent(payToken)}`);
      window.location.href = data.url; // redirect to Stripe
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <p>Loading invoice...</p>;
  if (err) return <p style={{ color: "crimson" }}>{err}</p>;
  if (!inv) return <p>Invoice not found.</p>;

  const isPaid = String(inv.Payment_Status || "").toLowerCase() === "paid";


  const paymentStatus = String(inv.Payment_Status || "").toLowerCase();
    const statusClass =
        paymentStatus === "paid"
            ? "paid"
            : paymentStatus === "unpaid"
            ? "unpaid"
            : "";


  const qrUrl = `${window.location.origin}/invoice/${encodeURIComponent(payToken || "")}`;


  return (
    
    <>
        <div className="invoice_content" style={{marginTop: 48, marginBottom: 48}}>
                {/* invoice header */}
                <div className="invo_header">
                    <div className="invo_header_left">
                        <img
                        src="https://cdn.prod.website-files.com/699278736373e981e3e70edf/699279f215ac17d63a9a56b2_e%20rx%20logo.svg"
                        loading="lazy"
                        alt="E-RxHub"
                        className="logo"
                        />
                        <div className="invo_header_left_txt">
                        <h1 className="invo_header_left_name">E-RxHub</h1>
                        <p className="invo_header_left_web">https://e-rxhub.com/</p>
                        <p className="invo_header_left_web">support@e-rxhub.com</p>
                        <p className="invo_header_left_web">+1(800)311-5805</p>
                        </div>
                    </div>

                    <div className="invo_header_right_txt">
                        <p className="invo_header_left_web">Business address</p>
                        <p className="invo_header_left_web">34911 US HWY 19N, PALM HARBOR, FL, 34684</p>
                        <p className="invo_header_left_web">TAX ID 00XXXXX1234X0XX</p>
                    </div>
                </div>
                {/* invoice body */}

                <div className="invo_body">
                    <div className="invo_body_header">
                        <div className="invo_body_header_txt_wp">
                            {/* Billed to */}
                            <div className="invo_body_header_txt">
                                <p className="invo_body_header_txt_light">Billed to</p>
                                <p className="invo_body_header_txt_dark">{formatPatientName(inv.Patient_Name) || "Customer"}</p>
                                <p className="invo_body_header_txt_light">
                                {safeTxt(inv.Practice_Name, "Company address")}
                                <br />
                                {safeTxt(inv.City, "City")}, {safeTxt(inv.Country, "Country")} -{" "}
                                {safeTxt(inv.Zip, "00000")}
                                </p>
                                <p className="invo_body_header_txt_light">{safeTxt(inv.Phone, "+0 (000) 123-4567")}</p>
                            </div>

                            {/* Invoice number / reference */}
                            <div className="invo_body_header_txt">
                                <p className="invo_body_header_txt_light">Invoice number</p>
                                <p className="invo_body_header_txt_dark">
                                #{safeTxt(inv.Invoice_Number || inv.Invoice_No || inv.Invoice_ID, "AB2324-01")}
                                </p>

                                <p className="invo_body_header_txt_light mt24">Reference</p>
                                <p className="invo_body_header_txt_dark">
                                {safeTxt(inv.Reference || inv.Ref || inv.Order_Number, "INV-057")}
                                </p>
                            </div>

                            {/* Total */}
                            <div className="invo_body_header_txt">
                                <p className="invo_body_header_txt_light">Invoice of (USD)</p>
                                <p className="invo_total_amount">{moneyUSD(inv.Total_Price)}</p>
                            </div>
                        </div>

                        {/* Subject / dates */}
                        <div className="invo_body_header_txt_wp">
                        <div className="invo_body_header_txt">
                            <p className="invo_body_header_txt_light">Subject</p>
                            <p className="invo_body_header_txt_dark">
                            {safeTxt(inv.Subject || inv.Medication_Prescriber || "Invoice")}
                            </p>
                        </div>

                        <div className="invo_body_header_txt">
                            <p className="invo_body_header_txt_light">Invoice date</p>
                            <p className="invo_body_header_txt_dark">{safeTxt(inv.Invoice_Date || inv.Fill_Date, "-")}</p>
                        </div>

                        <div className="invo_body_header_txt">
                            <p className="invo_body_header_txt_light">Due date</p>
                            <p className="invo_body_header_txt_dark">{safeTxt(inv.Due_Date, "-")}</p>
                        </div>
                        </div>

                        {/* Table */}
                        <div className="invo_table">
                            <div className="invo_table_heading">
                                <p className="invo_table_heading_txt">Item Detail</p>
                                <p className="invo_table_heading_txt">Qty</p>
                                <p className="invo_table_heading_txt">Amount</p>
                            </div>

                            <div className="invo_table_heading">
                                <p className="invo_table_heading_txt">
                                {safeTxt(inv.Item_Name || inv.Medication_Prescriber || "Item")}
                                </p>
                                <p className="invo_table_heading_txt">{safeTxt(inv.Qty, "1")}</p>
                                <p className="invo_table_heading_txt">{moneyUSD(inv.Item_Amount || inv.Total_Price)}</p>
                            </div>

                            <div className="invo_table_body_total">
                                <p className="invo_table_total_txt">Total:</p>
                                <p className="invo_table_total_txt">{moneyUSD(inv.Total_Price)}</p>
                            </div>

                            <div className="invo_table_body_payment_status">
                                <p className="invo_table_payment_txt">Payment Status</p>
                                <p className={`invo_table_payment_txt ${statusClass}`}>{safeTxt(inv.Payment_Status, "Unpaid")}</p>
                            </div>
                            <button
                                type="button"
                                className="payment-btn"
                                onClick={payNowStripe}
                                disabled={isPaid || paying}
                                title={isPaid ? "Already paid" : "Pay invoice"}
                            >
                            {isPaid ? "Already Paid" : paying ? "Redirecting..." : "Pay Outstanding Invoice (Stripe)"}
                            </button>
                        </div>
                </div>
                    <div className="invo_body_footer">
                        <div className="qrWrap">
                        <QRCode value={qrUrl || " "} size={100} />
                        </div>

                        {/* ✅ URL shown just after button */}
                        <p className="qr-url">{qrUrl}</p>

                        <p className="invo_body_footnote">
                        Please pay your invoice online at E-RxHub and click on “Pay Outstanding Invoice”.
                        </p>
                        <p className="invo_body_footnote">Your payment token is : {safeTxt(inv.Pay_Token || payToken)}</p>

                        <button type="button" className="refresh-btn" onClick={load}>
                        Refresh
                        </button>
          </div>
                </div>
          
{/* Terms */}
        <div className="invo_footer">
          <p className="footer_terms_txt tm">Terms &amp; Conditions</p>
          <p className="footer_terms_txt">Please pay within 15 days of receiving this invoice.</p>
        </div>
          
        </div>

        




      

      {/* <div style={{ height: 12 }} />

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Invoice</h2>

        <p style={{ margin: "6px 0" }}><b>Pay Token:</b> {inv.Pay_Token}</p>
        <p style={{ margin: "6px 0" }}><b>Status:</b> {inv.Payment_Status}</p>
        <p style={{ margin: "6px 0" }}><b>Total:</b> ${inv.Total_Price}</p>

        <hr style={{ margin: "14px 0" }} />

        <p style={{ margin: "6px 0" }}><b>Patient:</b> {inv.Patient_Name}</p>
        <p style={{ margin: "6px 0" }}><b>Practice:</b> {inv.Practice_Name}</p>
        <p style={{ margin: "6px 0" }}><b>Medication:</b> {inv.Medication_Prescriber}</p>
        <p style={{ margin: "6px 0" }}><b>Rx Number:</b> {inv.Rx_Number}</p>
        <p style={{ margin: "6px 0" }}><b>Order Number:</b> {inv.Order_Number}</p>
        <p style={{ margin: "6px 0" }}><b>Fill Date:</b> {inv.Fill_Date}</p>
        <p style={{ margin: "6px 0" }}><b>Tracking:</b> {inv.Tracking_Number}</p>

        <div style={{ height: 12 }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={payNowStripe}
            disabled={isPaid || paying}
            style={{ padding: "10px 14px" }}
          >
            {isPaid ? "Already Paid" : paying ? "Redirecting..." : "Pay Now (Stripe)"}
          </button>

          <button onClick={load}>Refresh</button>
        </div>

        <p style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
          After payment, refresh this page. Once you set up ngrok + Stripe webhook, it will auto-mark Paid.
        </p>
      </div> */}
    </>
  );
}
