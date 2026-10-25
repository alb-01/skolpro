// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Template } from "https://esm.sh/passkit-generator";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    const url = new URL(req.url);
    const studentId = url.searchParams.get("student_id");

    if (!studentId) {
        return new Response("Saknar student_id", { status: 400 });
    }

    // 1. Hämta elev från Supabase DB
    const { data: student, error } = await supabase
        .from("students")
        .select("*")
        .eq("student_id", studentId)
        .single();

    if (error || !student) {
        return new Response("Elev hittades inte", { status: 404 });
    }

    try {
        // 2. Skapa Pass-mall med PassKit Generator
        const template = await Template.load("./pass-template");

        // Sätt Apple Developer Certifikat (lagrade som Secrets i Supabase)
        template.setCertificate(Deno.env.get("APPLE_PASS_CERT"));
        template.setPrivateKey(Deno.env.get("APPLE_PASS_PRIVATE_KEY"), Deno.env.get("APPLE_PASS_KEY_PASSWORD"));

        // 3. Fyll i elevspecifika data i passet
        const pass = template.createPass({
            serialNumber: student.student_id,
            primaryFields: [{ key: "name", label: "ELEV", value: student.name }],
            secondaryFields: [
                { key: "student_id", label: "ELEV-ID", value: student.student_id },
                { key: "card_id", label: "KORT-ID", value: student.card_id || "PLS-000" }
            ],
            barcodes: [{
                format: "PKBarcodeFormatQR",
                message: `${url.origin}?student_id=${student.student_id}`,
                messageEncoding: "iso-8859-1"
            }]
        });

        const passBuffer = await pass.asBuffer();

        // 4. Returnera .pkpass filen till iOS/Apple Wallet
        return new Response(passBuffer, {
            headers: {
                "Content-Type": "application/vnd.apple.pkpass",
                "Content-Disposition": `attachment; filename="skolkort-${student.student_id}.pkpass"`
            }
        });

    } catch (err) {
        return new Response("Kunde inte generera Wallet-kort: " + err.message, { status: 500 });
    }
});