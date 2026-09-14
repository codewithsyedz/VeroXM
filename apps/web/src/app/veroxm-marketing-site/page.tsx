import { getMarketingPageContent } from "@/lib/veroxm-marketing-site";
import { VxmsHero } from "./VxmsHero";
import { VxmsTrustStrip } from "./VxmsTrustStrip";
import { VxmsFeatures } from "./VxmsFeatures";
import { VxmsScale } from "./VxmsScale";
import { VxmsCaseStudy } from "./VxmsCaseStudy";
import { VxmsCta } from "./VxmsCta";

export default async function VeroxmMarketingSitePage() {
  const content = await getMarketingPageContent();

  return (
    <>
      <VxmsHero content={content} />
      <VxmsTrustStrip heading={content.trustHeading} logos={content.trustLogos} />
      <VxmsFeatures heading={content.featuresHeading} subheading={content.featuresSubheading} cards={content.featureCards} />
      <VxmsScale
        heading={content.scaleHeading}
        description={content.scaleDescription}
        image={content.scaleImage}
        stats={content.scaleStats}
      />
      <VxmsCaseStudy
        heading={content.caseStudyHeading}
        videoThumbnail={content.caseStudyVideoThumbnail}
        featured={content.featuredCaseStudy}
        related={content.relatedCaseStudies}
      />
      <VxmsCta content={content} />
    </>
  );
}
