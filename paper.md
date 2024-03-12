---
title: 'Njobvu-AI: An open-source tool for collaborative image labeling and implementation of computer vision models'
tags:
  - Node.js
  - Camera Traps
  - Computer Vision
  - Data Tagging
  - Collaboration
authors:
  - name: Ashwin Subramanian
    orcid: 0009-0005-6369-5553
    affiliation: 1 
  - name: Jonathan S. Koning
    affiliation: 1
  - name: Cara L. Appel
    orcid: 0000-0002-4761-606X
    affiliation: "2, 3"
  - name: Christopher M. Sullivan
    orcid: 0000-0003-3344-5201
    affiliation: "1, 4"
  - name: Lisa Truong
    orcid: 0000-0003-1751-4617
    affiliation: 5
  - name: Robyn L. Tanguay
    orcid: 0000-0001-6190-3682
    affiliation: 5
  - name: Taal Levi
    orcid: 0000-0003-1853-8311
    affiliation: 2
  - name: Damon B. Lesmeister
    orcid: 0000-0003-1102-0122
    affiliation: "2, 3"

affiliations:
 - name: Center for Quantitative Life Sciences, Oregon State University, Corvallis, Oregon, USA
   index: 1
 - name: Department of Fisheries, Wildlife, and Conservation Sciences, Oregon State University, Corvallis, Oregon, USA
   index: 2
 - name: USDA Forest Service, Pacific Northwest Research Station, Corvallis, Oregon, USA
   index: 3
 - name: College of Earth, Ocean, and Atmospheric Sciences, Oregon State University, Corvallis, Oregon, USA
   index: 4
 - name: Department of Environmental and Molecular Toxicology, Oregon State University, Corvallis, Oregon, USA
   index: 5

date: 12 March 2024

---

# Summary

Practitioners interested in using computer vision models lack user-friendly and open-source software that combines features to label training data, allow multiple users, train new algorithms, review output, and implement new models. Labeling training data is critical for developing accurate object detection algorithms but is often not compatible with many cloud-based services due to limited internet bandwidth in many regions of the world. Desktop tools are useful in remote locations but lack capability to combine multiple projects. Furthermore, many tools offer features for labeling data or using pre-trained models for classification but are limited for creating and applying custom models. Free, open-source, and user-friendly software that offers a full suite of features is desirable to field researchers and conservationists that may have limited coding skills. We developed Njobvu-AI, a free, open-source tool that can be run on both desktop and server hardware using Node.js, allowing users to label data, combine projects for collaboration and review, train custom algorithms, and implement new computer vision models. The name Njobvu-AI (pronounced N-joh-voo AI), incorporating the Chichewa word for “elephant,” is inspired by a wildlife monitoring program in Malawi that was a primary impetus for the development of this tool. Code and documentation for this tool are available at https://github.com/sullichrosu/Njobvu-AI/.

# Statement of need

Advancements in computer vision and machine learning techniques have led to increasing usage for applied research. Many groups who use images, video, and acoustic data for projects across disciplines are interested in computer vision and machine learning to improve data processing workflows or solve novel problems. Unfortunately, using computer vision and machine learning requires substantial preparation prior to extracting information from unlabeled images, video, and audio data. Researchers typically start by labeling a subset of data with classes of interest. Labeled data are used to train object-recognition models to identify objects in new images.

Currently there are many cloud-based and desktop tools to label training data, but they often have limits around file size, multiple users, and proprietary software. These restrictions limit broad application and offer few options for working outside the web environment. Additionally, few tools allow users to train a custom computer vision model while retaining control over the training parameters and data ownership. Training custom models is therefore limited to experienced users of command-line programming or paid services. Here, we present Njobvu-AI (pronounced N-joh-voo AI), a free open-source tool that can be used both offline and online.

# Overview

Njobvu-AI is built on Node.js, a JavaScript runtime environment, to run in any web browser and utilizes the templating language EJS to render everything on the server side to maintain performance on the user’s machine (Koning et al. 2023). All data are uploaded on the server side, which uses SQLite3 for data organization. A global database stores user information and project metadata. Each project has its own database that stores project information (i.e., labels and photos) independent of the user. This compartmentalization allows for fast downloads, easy uploads, and high performance because only smaller databases are accessed for labeling.

Njobvu-AI leverages open-source neural network frameworks to enable in-house computer vision model training and image classification. The two frameworks utilized are Darknet (Redmon 2016) and TensorFlow (Abadi et al. 2015) with an emphasis on performance through accuracy and speed using the YOLO algorithm (Bochkovskiy et al. 2020). New projects may be created by uploading images and used to organize data by research topic for labeling. Images should span the full scope of the project with all classes to be indexed. New classes and additional training images can be added inside the project configuration page. On the labeling page, a user selects the desired class, draws a bounding box and labels the image. Njobvu-AI maintains proper spatial distances and box size when zooming in on large images. The ability to zoom facilitates compatibility with large images, such as TIFF or LARGE TIFF images from microscopes, and CAT (CT) scans.

We created a button to flag images for secondary review by other users. On the configuration page users can customize settings for their needs. Njobvu-AI provides basic statistics about the data for each project and an overview of project progress and balance of labels. On the download page, users can zip all contents for importing to another installation of Njobvu-AI. Users can also download the labeled dataset in TensorFlow, YOLO, COCO, or Pascal VOC formats for training outside Njobvu-AI.

Once users have completed labeling their training dataset, they can train a model on the TensorFlow or YOLO pages, which are two popular machine learning frameworks used in computer vision. On the TensorFlow page, a user can add multiple Python paths to accommodate the user’s relevant TensorFlow Python scripts. On the YOLO page, users can upload a pre-trained weights file and begin training using their labeled images. Pre-trained models may be downloaded and used for transfer learning, or users may wish to use previously trained models.

Users can apply their trained model to locate and identify objects in new images. Njobvu-AI will upload, process, and label the set of new images. Each image will contain bounding box(es) around predicted objects. Users can review and modify the predicted labels if needed. Users can navigate to validation mode to assess model performance on unlabeled datasets, correct labels, view results, sort by class, bulk class changes, and individual photo statistics.

Njobvu-AI is built on Node.js, so users can easily bring the system online using any web server hosting Node.js services. Njobvu-AI can be put into a cloud service and accessed from around the world if needed. Since we created Njobvu-AI as a small, contained package system, users can also install Node.js locally and run the tool on a desktop machine. We have successfully run the system on Windows, Mac, and Linux operating systems as well as x86 and POWER. Njobvu-AI is completely open source, allowing users to add custom formats and guarantee privacy.

# Acknowledgements

We thank Mazen Alotaibi, Thon Chao, and Pankaj Jaiswal for their contributions to the development of this project. Funding was provided by USDA Forest Service Pacific Northwest Research Station and the National Institutes of Health under Award P30 ES030287. The findings and conclusions in this publication are those of the authors and should not be construed to represent any official U.S. Department of Agriculture, National Institutes of Health, or U.S. Government determination or policy. The use of trade or firm names in this publication is for reader information and does not imply endorsement by the U.S. Government of any product or service.

# References

Abadi, M., A. Agarwal, P. Barham, E. Brevdo, Z. Chen, C. Citro, G. S. Corrado, A. Davis, J. Dean, M. Devin, S. Ghemawat, I. Goodfellow, A. Harp, G. Irving, M. Isard, and R. Jozefowicz. 2015. TensorFlow: Large-scale Machine Learning on Heterogeneous Systems. https://www.tensorflow.org/.

Bochkovskiy, A., C.-Y. Wang, and H.-Y. M. Liao. 2020. YOLOv4: Optimal speed and accuracy of object detections. arXiv.org 2004.10934.

Koning, J. S., A. Subramanian, M. Alotaibi, C. L. Appel, C. M. Sullivan, T. Chao, L. Truong, R. L. Tanguay, P. Jaiswal, T. Levi, and D. B. Lesmeister. 2023. Njobvu-AI: An open-source tool for collaborative image labeling and implementation of computer vision models. arXiv.org 2308.16435.

Redmon, J. 2016. Darknet: Open Source Neural Networks in C. https://pjreddie.com/darknet/.
