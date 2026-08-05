const helpData = {
    version: "2.0",
    topics: [
        {
            id: "getting-started",
            title: "Getting Started & Overview",
            icon: "fa-rocket",
            category: "General",
            summary: "Learn the core workflow of Njobvu-AI from project setup to inference deployment.",
            content: "Njobvu-AI is a computer vision and AI web platform for labeling, training, and running inference on custom object detection and classification models. The standard workflow follows: 1) Create or import a dataset project; 2) Annotate and review image labels; 3) Train computer vision models (YOLO, Inception, custom scripts); 4) Perform inference on new images or video; 5) Feed predictions back into training set for active learning."
        },
        {
            id: "projects-management",
            title: "Project Setup & Import Archives",
            icon: "fa-folder-plus",
            category: "Projects",
            summary: "Create blank projects or import YOLO, KW-COCO, IFCB, or pre-trained models.",
            content: "You can create new projects or import existing dataset archives:\n- **Blank Project:** Define project name, target object classes (comma-separated), and optional initial media.\n- **YOLO Archive:** Upload a .zip containing images and YOLO format txt bounding box labels.\n- **KW-COCO Archive:** Import COCO-formatted JSON annotations and images.\n- **IFCB Archive:** Import IFCB plankton imaging data files.\n- **Bootstrap:** Initialize project pre-populated with model annotations for fast labeling."
        },
        {
            id: "annotation-labeling",
            title: "Image Annotation & Labeling Tools",
            icon: "fa-tags",
            category: "Labeling",
            summary: "Annotate images with bounding boxes, review annotations, and manage class labels.",
            content: "The Annotation workbench provides interactive fabric.js canvas tools for drawing object bounding boxes:\n- **Drawing Box:** Click & drag on image to draw bounding boxes around target objects.\n- **Class Assignment:** Select class labels for each drawn bounding box.\n- **Review Mode:** Flag images requiring secondary review by domain experts.\n- **Hotkeys & Shortcuts:** Use arrow keys (←/→) to navigate between images; Delete/Backspace to remove boxes."
        },
        {
            id: "model-training",
            title: "Model Training & Custom Scripts",
            icon: "fa-brain",
            category: "Training",
            summary: "Configure training runs with YOLO, Inception, or custom Python scripts.",
            content: "Train deep learning models directly on annotated project data:\n- **Data Split:** Set Training / Validation percentage split using the range slider.\n- **YOLO Training:** Support for YOLOv3 and YOLOX architectures.\n- **Custom Training:** Upload custom Python script files (.py) and model weights (.h5, .pth, .weights).\n- **Logs & Monitor:** View real-time training progress logs and check run statuses (RUNNING, COMPLETED, FAILED)."
        },
        {
            id: "inference-runs",
            title: "Inference Execution & Active Learning",
            icon: "fa-eye",
            category: "Inference",
            summary: "Run model inference on unseen data and add high-confidence detections back to training.",
            content: "Perform object detection and classification inference:\n- **Execute Model:** Run trained models on test sets or new images/videos.\n- **Min Confidence Threshold:** Set minimum confidence score filter (e.g. 0.5).\n- **Add to Training Set:** Automatically export predictions above confidence threshold directly into the project training set for active learning iterations.\n- **Image Viewer:** Interactive image carousel viewer to inspect bounding box overlay outputs."
        },
        {
            id: "configuration-settings",
            title: "Configuration & Access Controls",
            icon: "fa-cog",
            category: "Settings",
            summary: "Manage project details, class lists, user permissions, and image pre-processing.",
            content: "Project configuration options:\n- **Project Settings:** Update project description or safely delete workspace.\n- **Class Settings:** Add, update, or remove class labels and target color mappings.\n- **Access Control:** Grant or revoke user read/write access permissions to projects.\n- **Merge Settings:** Configure label merge thresholds for duplicate detections."
        }
    ],
    tooltips: {
        "nav-help": "Open Njobvu-AI Documentation and Wiki",
        "btn-create-project": "Start a new project from scratch, archive (YOLO/KW-COCO/IFCB), or bootstrap model",
        "btn-switch-validation": "Toggle between standard labeling and validation quality assurance mode",
        "btn-import-project": "Import an existing project database or exported archive file",
        "input-classes": "Enter comma-separated class names (e.g. car, truck, pedestrian) without extra spaces",
        "training-slider": "Percentage of labeled images allocated to training set vs validation set",
        "min-conf": "Minimum prediction probability required to accept a detection bounding box (0.0 to 1.0)",
        "add-to-dataset": "Copy inference detections above confidence threshold into project labeled dataset",
        "review-status": "Indicates whether images in this project have been flagged for expert quality review"
    }
};

const getHelpApi = async (req, res) => {
    try {
        const query = (req.query.q || "").toLowerCase().trim();
        if (!query) {
            return res.status(200).json({
                success: true,
                data: helpData
            });
        }

        // Filter topics by query search string
        const filteredTopics = helpData.topics.filter(topic =>
            topic.title.toLowerCase().includes(query) ||
            topic.summary.toLowerCase().includes(query) ||
            topic.content.toLowerCase().includes(query) ||
            topic.category.toLowerCase().includes(query)
        );

        return res.status(200).json({
            success: true,
            query: query,
            data: {
                ...helpData,
                topics: filteredTopics
            }
        });
    } catch (err) {
        global.logger.error("Error in getHelpApi:", err);
        return res.status(500).json({
            success: false,
            error: "Failed to retrieve help documentation data"
        });
    }
};

module.exports = { getHelpApi, helpData };
